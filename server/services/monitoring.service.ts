import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { LessThan } from 'typeorm';
import { COLLECTIONS } from '../../shared/constants';
import { ReminderStatus, WhatsAppDeliveryStatus } from '../../shared/enums';
import { ReminderJobEntity } from '../models/reminder-job.model';
import { SecurityEventEntity } from '../models/security-event.model';
import { SecurityEventKind } from '../models/security-event.model';
import { WhatsAppDeliveryEntity } from '../models/whatsapp-delivery.model';
import { WorkerRunEntity } from '../models/worker-run.model';
import { WorkerLeaseEntity } from '../models/worker-lease.model';
import { DatabaseService } from './database.service';

const SECURITY_WINDOW_MS = 60 * 60 * 1000;
const SECURITY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const REMINDER_BACKLOG_MS = 60 * 60 * 1000;
const WORKER_STALE_MULTIPLIER = 3;
const FAILED_SIGNIN_ALERT_COUNT = 20;

export enum OperationalAlert {
  ReminderWorkerStale = 'reminder_worker_stale',
  ReminderLeaseExpired = 'reminder_lease_expired',
  ReminderBacklog = 'reminder_backlog',
  FailedWhatsAppDeliveries = 'failed_whatsapp_deliveries',
  FailedSignIns = 'failed_signins',
}

@Injectable()
export class MonitoringService {
  private readonly startedAt = Date.now();

  private lastPrunedAt = 0;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async securityEvent(kind: SecurityEventKind, email: string): Promise<void> {
    const subjectHash = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
    const shouldPrune = Date.now() - this.lastPrunedAt >= SECURITY_WINDOW_MS;
    await this.database.transaction(async (manager) => {
      await manager
        .getRepository(SecurityEventEntity)
        .insert({ id: randomUUID(), kind, subjectHash, at: new Date().toISOString() });
      if (shouldPrune) {
        await manager
          .getRepository(SecurityEventEntity)
          .delete({ at: LessThan(new Date(Date.now() - SECURITY_RETENTION_MS).toISOString()) });
      }
    });
    if (shouldPrune) {this.lastPrunedAt = Date.now();}
  }

  async workerStarted(name: string): Promise<void> {
    await this.database.transaction(async (manager) => {
      const repository = manager.getRepository(WorkerRunEntity);
      const existing = await repository.findOneBy({ name });
      await repository.save({
        name,
        lastStartedAt: new Date().toISOString(),
        lastFinishedAt: existing?.lastFinishedAt ?? '',
        lastSuccessAt: existing?.lastSuccessAt ?? '',
        lastError: existing?.lastError ?? '',
      });
    });
  }

  async workerFinished(name: string, error: string | null): Promise<void> {
    await this.database.transaction(async (manager) => {
      const repository = manager.getRepository(WorkerRunEntity);
      const existing = await repository.findOneBy({ name });
      const now = new Date().toISOString();
      await repository.save({
        name,
        lastStartedAt: existing?.lastStartedAt ?? now,
        lastFinishedAt: now,
        lastSuccessAt: error ? (existing?.lastSuccessAt ?? '') : now,
        lastError: error ?? '',
      });
    });
  }

  async operations(): Promise<{
    status: 'healthy' | 'degraded';
    alerts: OperationalAlert[];
    failedSignInsLastHour: number;
    oldQueuedReminders: number;
    failedWhatsAppDeliveries: number;
    reminderWorkerLastSuccessAt: string;
    reminderWorkerLastDurationMs: number | null;
    reminderLeaseExpiresAt: string;
  }> {
    const now = Date.now();
    const result = await this.database.transaction(async (manager) => {
      const [worker, lease, failedSignInsLastHour, oldQueuedReminders, failedWhatsAppDeliveries] =
        await Promise.all([
          manager.getRepository(WorkerRunEntity).findOneBy({ name: 'reminder-scheduler' }),
          manager.getRepository(WorkerLeaseEntity).findOneBy({ name: 'reminder-scheduler' }),
          manager
            .getRepository(SecurityEventEntity)
            .createQueryBuilder('event')
            .where('event.at >= :since', {
              since: new Date(now - SECURITY_WINDOW_MS).toISOString(),
            })
            .andWhere('event.kind IN (:...kinds)', {
              kinds: [SecurityEventKind.PasswordRejected, SecurityEventKind.AuthenticatorRejected],
            })
            .getCount(),
          manager
            .getRepository(ReminderJobEntity)
            .countBy({
              status: ReminderStatus.Queued,
              scheduledAt: LessThan(new Date(now - REMINDER_BACKLOG_MS).toISOString()),
            }),
          manager
            .getRepository(WhatsAppDeliveryEntity)
            .countBy({ status: WhatsAppDeliveryStatus.Failed }),
        ]);

      return { worker, lease, failedSignInsLastHour, oldQueuedReminders, failedWhatsAppDeliveries };
    }, true);
    const alerts: OperationalAlert[] = [];
    const staleWindow = COLLECTIONS.workerIntervalMs * WORKER_STALE_MULTIPLIER;
    if (
      now - this.startedAt > staleWindow &&
      (!result.worker?.lastSuccessAt || Date.parse(result.worker.lastSuccessAt) < now - staleWindow)
    )
      {alerts.push(OperationalAlert.ReminderWorkerStale);}
    if (result.oldQueuedReminders > 0) {alerts.push(OperationalAlert.ReminderBacklog);}
    if (
      result.lease?.ownerToken &&
      Date.parse(result.lease.expiresAt) < now
    ) {alerts.push(OperationalAlert.ReminderLeaseExpired);}
    if (result.failedWhatsAppDeliveries > 0) {alerts.push(OperationalAlert.FailedWhatsAppDeliveries);}
    if (result.failedSignInsLastHour >= FAILED_SIGNIN_ALERT_COUNT)
      {alerts.push(OperationalAlert.FailedSignIns);}

    return {
      status: alerts.length ? 'degraded' : 'healthy',
      alerts,
      failedSignInsLastHour: result.failedSignInsLastHour,
      oldQueuedReminders: result.oldQueuedReminders,
      failedWhatsAppDeliveries: result.failedWhatsAppDeliveries,
      reminderWorkerLastSuccessAt: result.worker?.lastSuccessAt ?? '',
      reminderWorkerLastDurationMs:
        result.worker?.lastFinishedAt &&
        result.worker.lastStartedAt &&
        Date.parse(result.worker.lastFinishedAt) >= Date.parse(result.worker.lastStartedAt)
          ? Date.parse(result.worker.lastFinishedAt) - Date.parse(result.worker.lastStartedAt)
          : null,
      reminderLeaseExpiresAt: result.lease?.ownerToken ? result.lease.expiresAt : '',
    };
  }
}
