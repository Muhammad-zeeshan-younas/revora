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

import { applyCommand, refreshPromises } from '../../shared/domain';

import { today } from '../../shared/finance';

@Injectable()
export class ReminderWorker implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  private running = false;

  constructor(@Inject(WorkspaceRepository) private readonly workspaces: WorkspaceRepository) {}

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
    try {
      const organizations = await this.workspaces.findAll();
      const hour = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: FINANCE.timezone,
          hour: '2-digit',
          hourCycle: 'h23',
        }).format(new Date()),
      );
      for (const organization of organizations) {
        let data = structuredClone(organization.data);
        refreshPromises(data);
        if (
          data.settings.remindersEnabled &&
          hour >= data.settings.reminderHour &&
          hour <= COLLECTIONS.latestReminderHour
        ) {
          for (const customer of data.customers) {
            if (
              data.jobs.some(
                (job) =>
                  job.customerId === customer.id && today(new Date(job.scheduledAt)) === today(),
              )
            ) {
              continue;
            }
            try {
              data = applyCommand(
                data,
                { type: CommandType.QueueReminder, customerId: customer.id },
                'Collection scheduler',
                Role.Admin,
              );
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
        if (JSON.stringify(data) !== JSON.stringify(organization.data)) {
          try {
            await this.workspaces.save(organization, data);
          } catch (error) {
            if (!(error instanceof ConflictException)) {
              throw error;
            }
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
