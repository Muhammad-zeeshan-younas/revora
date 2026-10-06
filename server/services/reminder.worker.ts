import { COLLECTIONS, FINANCE } from '../../shared/constants';
import { AuditEvent, CommandType, ReminderStatus, Role } from '../../shared/enums';

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { WorkspaceRepository } from '../repositories/workspace.repository';
import { MonitoringService } from './monitoring.service';

import { applyCommand, refreshPromises } from '../../shared/domain';

import { today } from '../../shared/finance';

const REMINDER_WORKER_LEASE = 'reminder-scheduler';

@Injectable()
export class ReminderWorker implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  private running = false;

  constructor(
    @Inject(WorkspaceRepository) private readonly workspaces: WorkspaceRepository,
    @Inject(MonitoringService) private readonly monitoring: MonitoringService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick().catch((error) =>
        Logger.error(error instanceof Error ? error.message : 'Worker failed', 'Reminders'),
      );
    }, COLLECTIONS.workerIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    const ownerToken = crypto.randomUUID();
    let leaseAcquired = false;
    let leaseLost = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let runError: string | null = null;

    try {
      leaseAcquired = await this.workspaces.acquireWorkerLease(
        REMINDER_WORKER_LEASE,
        ownerToken,
        COLLECTIONS.workerLeaseMs,
      );
      if (!leaseAcquired) {
        return;
      }
      await this.monitoring.workerStarted(REMINDER_WORKER_LEASE);

      heartbeat = setInterval(
        () => {
          void this.workspaces
            .renewWorkerLease(REMINDER_WORKER_LEASE, ownerToken, COLLECTIONS.workerLeaseMs)
            .then((renewed) => {
              leaseLost ||= !renewed;
            })
            .catch(() => {
              leaseLost = true;
            });
        },
        Math.floor(COLLECTIONS.workerLeaseMs / 3),
      );

      const hour = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: FINANCE.timezone,
          hour: '2-digit',
          hourCycle: 'h23',
        }).format(new Date()),
      );
      const candidateIds = await this.workspaces.findReminderCandidateIds(hour);
      for (const organizationId of candidateIds) {
        if (leaseLost) {
          break;
        }
        const leaseRenewed = await this.workspaces.renewWorkerLease(
          REMINDER_WORKER_LEASE,
          ownerToken,
          COLLECTIONS.workerLeaseMs,
        );
        if (!leaseRenewed) {
          leaseLost = true;
          break;
        }

        const organization = await this.workspaces.findById(organizationId);
        let data = structuredClone(organization.data);
        refreshPromises(data);
        if (
          data.settings.remindersEnabled &&
          hour >= data.settings.reminderHour &&
          hour <= COLLECTIONS.latestReminderHour
        ) {
          const scheduledToday = new Set(
            data.jobs
              .filter((job) => today(new Date(job.scheduledAt)) === today())
              .map((job) => job.customerId),
          );
          for (const customer of data.customers) {
            if (scheduledToday.has(customer.id)) {
              continue;
            }
            try {
              data = applyCommand(
                data,
                { type: CommandType.QueueReminder, customerId: customer.id },
                'Collection scheduler',
                Role.Admin,
              );
              scheduledToday.add(customer.id);
            } catch {
              /* Ineligible accounts and rate limits are expected. */
            }
          }
        }
        for (const job of data.jobs) {
          if (job.status !== ReminderStatus.Queued) {
            continue;
          }
          job.status = ReminderStatus.Prepared;
          data.audit.unshift({
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            actor: 'Collection scheduler',
            action: AuditEvent.ReminderPrepared,
            detail: 'Reminder prepared in outbox. WhatsApp delivery is not connected.',
            entityId: job.id,
          });
        }
        if (!leaseLost && JSON.stringify(data) !== JSON.stringify(organization.data)) {
          try {
            await this.workspaces.save(organization, data);
          } catch (error) {
            if (!(error instanceof ConflictException)) {
              throw error;
            }
          }
        }
      }
    } catch (error) {
      runError = error instanceof Error ? error.message : 'Worker failed.';
      throw error;
    } finally {
      if (leaseLost && !runError) {
        runError = 'Reminder worker lease was lost.';
      }
      try {
        if (heartbeat) {
          clearInterval(heartbeat);
        }
        if (leaseAcquired) {
          await this.workspaces.releaseWorkerLease(REMINDER_WORKER_LEASE, ownerToken);
        }
      } finally {
        try {
          if (leaseAcquired) {
            await this.monitoring.workerFinished(REMINDER_WORKER_LEASE, runError);
          }
        } finally {
          this.running = false;
        }
      }
    }
  }
}
