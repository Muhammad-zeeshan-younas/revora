import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import {
  CommunicationChannel,
  InteractionOutcome,
  MessageDirection,
  ReminderStatus,
  WhatsAppDeliveryStatus,
} from '../../shared/enums';
import { CustomerEntity } from '../models/customer.model';
import { InteractionEntity } from '../models/interaction.model';
import { OrganizationEntity } from '../models/organization.model';
import { ReminderJobEntity } from '../models/reminder-job.model';
import { WhatsAppDeliveryEntity } from '../models/whatsapp-delivery.model';
import type { WhatsAppDeliveryRecord } from '../models/whatsapp-delivery.model';
import { WhatsAppWebhookEventEntity } from '../models/whatsapp-webhook-event.model';
import { WhatsAppStatusEventEntity } from '../models/whatsapp-status-event.model';
import { WhatsAppConsentEntity } from '../models/whatsapp-consent.model';
import type { WhatsAppConsentRecord } from '../models/whatsapp-consent.model';
import { AuditEventEntity } from '../models/audit-event.model';
import { DatabaseService } from '../services/database.service';

export interface ClaimedWhatsAppReminder {
  jobId: string;
  customerId: string;
  claimToken: string;
}

const STATUS_RANK: Record<WhatsAppDeliveryStatus, number> = {
  [WhatsAppDeliveryStatus.RetryReady]: 0,
  [WhatsAppDeliveryStatus.Sending]: 0,
  [WhatsAppDeliveryStatus.Accepted]: 0.5,
  [WhatsAppDeliveryStatus.Sent]: 1,
  [WhatsAppDeliveryStatus.Delivered]: 2,
  [WhatsAppDeliveryStatus.Read]: 3,
  [WhatsAppDeliveryStatus.Failed]: 1.5,
  [WhatsAppDeliveryStatus.Unknown]: 0.25,
};
const PHONE_NON_DIGIT_PATTERN = /\D/g;
const WHATSAPP_OPT_OUT_PATTERN = /^(stop|unsubscribe)$/i;

@Injectable()
export class WhatsAppDeliveryRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listConsents(organizationId: string): Promise<WhatsAppConsentRecord[]> {
    return this.database.transaction(
      (manager) => manager.getRepository(WhatsAppConsentEntity).findBy({ organizationId }),
      true,
    );
  }

  async hasConsent(organizationId: string, customerId: string): Promise<boolean> {
    return this.database.transaction(
      async (manager) =>
        Boolean(
          await manager
            .getRepository(WhatsAppConsentEntity)
            .findOneBy({ organizationId, customerId }),
        ),
      true,
    );
  }

  async setConsent(
    organizationId: string,
    customerId: string,
    consented: boolean,
    source: string,
    revision: number,
    actor: string,
  ): Promise<number> {
    return this.database.transaction(async (manager) => {
      const customer = await manager.getRepository(CustomerEntity).findOneBy({
        organizationId,
        id: customerId,
      });
      if (!customer) {
        throw new ConflictException('Customer is unavailable.');
      }
      const updated = await manager
        .getRepository(OrganizationEntity)
        .update({ id: organizationId, revision }, { revision: revision + 1 });
      if (updated.affected !== 1) {
        throw new ConflictException('Workspace changed. Refresh before saving consent.');
      }
      if (consented) {
        await manager.getRepository(WhatsAppConsentEntity).upsert(
          {
            organizationId,
            customerId,
            source,
            recordedBy: actor,
            recordedAt: new Date().toISOString(),
          },
          ['organizationId', 'customerId'],
        );
      } else {
        await manager.getRepository(WhatsAppConsentEntity).delete({ organizationId, customerId });
      }
      const minimum = await manager
        .getRepository(AuditEventEntity)
        .createQueryBuilder('event')
        .select('MIN(event.sortOrder)', 'minimum')
        .where('event.organizationId = :organizationId', { organizationId })
        .getRawOne<{ minimum: number | null }>();
      await manager.getRepository(AuditEventEntity).insert({
        id: crypto.randomUUID(),
        organizationId,
        sortOrder: (minimum?.minimum ?? 0) - 1,
        at: new Date().toISOString(),
        actor,
        action: consented ? 'whatsapp.consent.granted' : 'whatsapp.consent.revoked',
        detail: `${customer.name}: ${source}`,
        entityId: customerId,
      });

      return revision + 1;
    });
  }

  async list(organizationId: string): Promise<WhatsAppDeliveryRecord[]> {
    return this.database.transaction(
      (manager) => manager.getRepository(WhatsAppDeliveryEntity).findBy({ organizationId }),
      true,
    );
  }

  async find(organizationId: string, jobId: string): Promise<WhatsAppDeliveryRecord | null> {
    return this.database.transaction(
      (manager) =>
        manager.getRepository(WhatsAppDeliveryEntity).findOneBy({ organizationId, jobId }),
      true,
    );
  }

  async expireClaims(organizationId: string, before: string): Promise<void> {
    await this.database.transaction(async (manager) => {
      await manager
        .getRepository(WhatsAppDeliveryEntity)
        .createQueryBuilder()
        .update()
        .set({
          status: WhatsAppDeliveryStatus.Unknown,
          lastError: 'The sender stopped before confirming the provider response.',
          updatedAt: new Date().toISOString(),
        })
        .where('organizationId = :organizationId AND status = :status AND updatedAt < :before', {
          organizationId,
          status: WhatsAppDeliveryStatus.Sending,
          before,
        })
        .execute();
    });
  }

  async retry(organizationId: string, jobId: string): Promise<void> {
    await this.database.transaction(async (manager) => {
      const job = await manager.getRepository(ReminderJobEntity).findOneBy({
        organizationId,
        id: jobId,
        status: ReminderStatus.Prepared,
      });
      if (!job) {
        throw new ConflictException('Reminder is no longer prepared for delivery.');
      }
      const result = await manager.getRepository(WhatsAppDeliveryEntity).update(
        {
          organizationId,
          jobId,
          status: WhatsAppDeliveryStatus.Failed,
          providerMessageId: IsNull(),
        },
        { status: WhatsAppDeliveryStatus.RetryReady, updatedAt: new Date().toISOString() },
      );
      if (result.affected !== 1) {
        throw new ConflictException('Only a confirmed failed send can be retried.');
      }
    });
  }

  async claimNext(organizationId: string): Promise<ClaimedWhatsAppReminder | null> {
    return this.database.transaction(async (manager) => {
      const job = await manager
        .getRepository(ReminderJobEntity)
        .createQueryBuilder('job')
        .leftJoin(
          'whatsapp_deliveries',
          'delivery',
          'delivery.organizationId = job.organizationId AND delivery.jobId = job.id',
        )
        .innerJoin(
          'whatsapp_consents',
          'consent',
          'consent.organizationId = job.organizationId AND consent.customerId = job.customerId',
        )
        .where('job.organizationId = :organizationId', { organizationId })
        .andWhere('job.status = :status', { status: ReminderStatus.Prepared })
        .andWhere('job.scheduledAt <= :now', { now: new Date().toISOString() })
        .andWhere('(delivery.jobId IS NULL OR delivery.status = :retryReady)', {
          retryReady: WhatsAppDeliveryStatus.RetryReady,
        })
        .orderBy('job.scheduledAt', 'ASC')
        .getOne();
      if (!job) {
        return null;
      }
      const claimToken = crypto.randomUUID();
      if (
        await manager
          .getRepository(WhatsAppDeliveryEntity)
          .findOneBy({ organizationId, jobId: job.id })
      ) {
        await manager
          .getRepository(WhatsAppDeliveryEntity)
          .createQueryBuilder()
          .update()
          .set({
            status: WhatsAppDeliveryStatus.Sending,
            attemptCount: () => '"attemptCount" + 1',
            claimToken,
            lastError: '',
            updatedAt: new Date().toISOString(),
          })
          .where('organizationId = :organizationId AND jobId = :jobId AND status = :status', {
            organizationId,
            jobId: job.id,
            status: WhatsAppDeliveryStatus.RetryReady,
          })
          .execute();
      } else {
        await manager
          .createQueryBuilder()
          .insert()
          .into(WhatsAppDeliveryEntity)
          .values({
            organizationId,
            jobId: job.id,
            providerMessageId: null,
            status: WhatsAppDeliveryStatus.Sending,
            attemptCount: 1,
            claimToken,
            lastError: '',
            updatedAt: new Date().toISOString(),
          })
          .orIgnore()
          .execute();
      }
      const claim = await manager.getRepository(WhatsAppDeliveryEntity).findOneBy({
        organizationId,
        jobId: job.id,
        claimToken,
      });

      return claim
        ? {
            jobId: job.id,
            customerId: job.customerId,
            claimToken,
          }
        : null;
    });
  }

  async finish(
    organizationId: string,
    claim: ClaimedWhatsAppReminder,
    status: WhatsAppDeliveryStatus,
    providerMessageId: string | null,
    error = '',
  ): Promise<void> {
    await this.database.transaction(async (manager) => {
      const events = providerMessageId
        ? await manager
            .getRepository(WhatsAppStatusEventEntity)
            .findBy({ messageId: providerMessageId })
        : [];
      const latestStatus = events.reduce(
        (current, event) =>
          STATUS_RANK[event.status] > STATUS_RANK[current] ? event.status : current,
        status,
      );
      await manager.getRepository(WhatsAppDeliveryEntity).update(
        {
          organizationId,
          jobId: claim.jobId,
          claimToken: claim.claimToken,
          status: WhatsAppDeliveryStatus.Sending,
        },
        {
          status: latestStatus,
          providerMessageId,
          lastError: error.slice(0, 500),
          updatedAt: new Date().toISOString(),
        },
      );
    });
  }

  async recordStatus(messageId: string, status: WhatsAppDeliveryStatus): Promise<void> {
    await this.database.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .insert()
        .into(WhatsAppStatusEventEntity)
        .values({ messageId, status, updatedAt: new Date().toISOString() })
        .orIgnore()
        .execute();
      const repository = manager.getRepository(WhatsAppDeliveryEntity);
      const delivery = await repository.findOneBy({ providerMessageId: messageId });
      if (!delivery || STATUS_RANK[status] <= STATUS_RANK[delivery.status]) {
        return;
      }
      await repository.update(
        { organizationId: delivery.organizationId, jobId: delivery.jobId },
        { status, updatedAt: new Date().toISOString() },
      );
    });
  }

  async recordIncoming(
    organizationId: string,
    messageId: string,
    from: string,
    message: string,
  ): Promise<void> {
    await this.database.transaction(async (manager) => {
      const claimToken = crypto.randomUUID();
      await manager
        .createQueryBuilder()
        .insert()
        .into(WhatsAppWebhookEventEntity)
        .values({ id: messageId, receivedAt: new Date().toISOString(), claimToken })
        .orIgnore()
        .execute();
      const accepted = await manager.getRepository(WhatsAppWebhookEventEntity).findOneBy({
        id: messageId,
        claimToken,
      });
      if (!accepted) {
        return;
      }
      const customers = await manager.getRepository(CustomerEntity).find({
        where: { organizationId, phone: `+${from.replaceAll(PHONE_NON_DIGIT_PATTERN, '')}` },
        take: 2,
      });
      if (customers.length !== 1) {
        return;
      }
      const customer = customers[0]!;
      const organization = await manager.getRepository(OrganizationEntity).findOneBy({
        id: organizationId,
      });
      if (!organization) {
        return;
      }
      const minimum = await manager
        .getRepository(InteractionEntity)
        .createQueryBuilder('interaction')
        .select('MIN(interaction.sortOrder)', 'minimum')
        .where('interaction.organizationId = :organizationId', { organizationId })
        .getRawOne<{ minimum: number | null }>();
      const revision = await manager
        .getRepository(OrganizationEntity)
        .update(
          { id: organizationId, revision: organization.revision },
          { revision: organization.revision + 1 },
        );
      if (revision.affected !== 1) {
        throw new ConflictException('Workspace changed while recording the customer reply.');
      }
      await manager.getRepository(InteractionEntity).insert({
        id: crypto.randomUUID(),
        organizationId,
        sortOrder: (minimum?.minimum ?? 0) - 1,
        customerId: customer.id,
        at: new Date().toISOString(),
        author: customer.contact,
        channel: CommunicationChannel.WhatsApp,
        message: message.slice(0, 2000),
        outcome: InteractionOutcome.Note,
        nextAction: '',
        direction: MessageDirection.Inbound,
      });
      if (WHATSAPP_OPT_OUT_PATTERN.test(message.trim())) {
        await manager
          .getRepository(WhatsAppConsentEntity)
          .delete({ organizationId, customerId: customer.id });
        const auditMinimum = await manager
          .getRepository(AuditEventEntity)
          .createQueryBuilder('event')
          .select('MIN(event.sortOrder)', 'minimum')
          .where('event.organizationId = :organizationId', { organizationId })
          .getRawOne<{ minimum: number | null }>();
        await manager.getRepository(AuditEventEntity).insert({
          id: crypto.randomUUID(),
          organizationId,
          sortOrder: (auditMinimum?.minimum ?? 0) - 1,
          at: new Date().toISOString(),
          actor: customer.contact,
          action: 'whatsapp.consent.revoked',
          detail: `${customer.name} sent an opt-out request on WhatsApp.`,
          entityId: customer.id,
        });
      }
    });
  }
}
