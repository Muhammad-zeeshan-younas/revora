import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { COLLECTIONS, FINANCE } from '../../shared/constants';
import { CustomerStatus, ReminderStatus, WhatsAppDeliveryStatus } from '../../shared/enums';
import { account, balance } from '../../shared/finance';
import { WorkspaceRepository } from '../repositories/workspace.repository';
import { WhatsAppDeliveryRepository } from '../repositories/whatsapp-delivery.repository';

const GRAPH_VERSION_PATTERN = /^v\d+\.\d+$/;
const WEBHOOK_SIGNATURE_PATTERN = /^sha256=[0-9a-f]{64}$/i;
const DELIVERY_BATCH_LIMIT = 20;
const DELIVERY_CLAIM_EXPIRY_MS = 2 * 60_000;
const META_REQUEST_TIMEOUT_MS = 10_000;
const META_RESPONSE_SCHEMA = z.object({ messages: z.array(z.object({ id: z.string() })).min(1) });
const META_WEBHOOK_SCHEMA = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            statuses: z.array(z.object({ id: z.string(), status: z.string() })).optional(),
            messages: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

interface WhatsAppConfig {
  organizationId: string;
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  templateName: string;
  templateLanguage: string;
  graphVersion: string;
}

function configuredWhatsApp(): WhatsAppConfig | null {
  const values = {
    organizationId: process.env['WHATSAPP_ORGANIZATION_ID'] ?? '',
    phoneNumberId: process.env['WHATSAPP_PHONE_NUMBER_ID'] ?? '',
    accessToken: process.env['WHATSAPP_ACCESS_TOKEN'] ?? '',
    appSecret: process.env['WHATSAPP_APP_SECRET'] ?? '',
    verifyToken: process.env['WHATSAPP_VERIFY_TOKEN'] ?? '',
    templateName: process.env['WHATSAPP_TEMPLATE_NAME'] ?? '',
    templateLanguage: process.env['WHATSAPP_TEMPLATE_LANGUAGE'] ?? '',
    graphVersion: process.env['WHATSAPP_GRAPH_VERSION'] ?? '',
  };
  if (Object.values(values).every((value) => !value)) {
    return null;
  }
  if (
    Object.values(values).some((value) => !value) ||
    !GRAPH_VERSION_PATTERN.test(values.graphVersion)
  ) {
    throw new Error('WhatsApp configuration is incomplete or has an invalid Graph API version.');
  }

  return values;
}

@Injectable()
export class WhatsAppService implements OnModuleInit, OnModuleDestroy {
  private readonly config = configuredWhatsApp();

  private timer: ReturnType<typeof setInterval> | null = null;

  private running = false;

  constructor(
    @Inject(WhatsAppDeliveryRepository) private readonly deliveries: WhatsAppDeliveryRepository,
    @Inject(WorkspaceRepository) private readonly workspaces: WorkspaceRepository,
  ) {}

  onModuleInit(): void {
    if (!this.config) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick().catch((error) =>
        Logger.error(
          error instanceof Error ? error.message : 'WhatsApp delivery failed',
          'WhatsApp',
        ),
      );
    }, COLLECTIONS.workerIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  verifyChallenge(mode: string, token: string, challenge: string): string {
    if (!this.config || mode !== 'subscribe' || token !== this.config.verifyToken) {
      throw new ForbiddenException('Webhook verification failed.');
    }

    return challenge;
  }

  async webhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    body: object,
  ): Promise<void> {
    if (!this.config || !rawBody || !signature || !WEBHOOK_SIGNATURE_PATTERN.test(signature)) {
      throw new ForbiddenException('Webhook signature is missing.');
    }
    const expected = createHmac('sha256', this.config.appSecret).update(rawBody).digest();
    const supplied = Buffer.from(signature.slice('sha256='.length), 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new ForbiddenException('Webhook signature is invalid.');
    }

    const payload = META_WEBHOOK_SCHEMA.parse(body);
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.value.metadata?.phone_number_id !== this.config.phoneNumberId) {
          continue;
        }
        for (const event of change.value.statuses ?? []) {
          const status = Object.values(WhatsAppDeliveryStatus).find(
            (item) => item === event.status,
          );
          if (
            status &&
            [
              WhatsAppDeliveryStatus.Sent,
              WhatsAppDeliveryStatus.Delivered,
              WhatsAppDeliveryStatus.Read,
              WhatsAppDeliveryStatus.Failed,
            ].includes(status)
          ) {
            await this.deliveries.recordStatus(event.id, status);
          }
        }
        for (const message of change.value.messages ?? []) {
          const summary =
            message.type === 'text'
              ? (message.text?.body ?? '')
              : `Customer sent a ${message.type} message.`;
          if (summary) {
            await this.deliveries.recordIncoming(
              this.config.organizationId,
              message.id,
              message.from,
              summary,
            );
          }
        }
      }
    }
  }

  async tick(): Promise<void> {
    if (!this.config || this.running) {
      return;
    }
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: FINANCE.timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()),
    );
    if (hour < COLLECTIONS.earliestReminderHour || hour > COLLECTIONS.latestReminderHour) {
      return;
    }
    this.running = true;
    try {
      await this.deliveries.expireClaims(
        this.config.organizationId,
        new Date(Date.now() - DELIVERY_CLAIM_EXPIRY_MS).toISOString(),
      );
      for (let index = 0; index < DELIVERY_BATCH_LIMIT; index++) {
        const claim = await this.deliveries.claimNext(this.config.organizationId);
        if (!claim) {
          break;
        }
        const record = await this.workspaces.findById(this.config.organizationId);
        const job = record.data.jobs.find((item) => item.id === claim.jobId);
        const customer = record.data.customers.find((item) => item.id === claim.customerId);
        if (
          !job ||
          job.status !== ReminderStatus.Prepared ||
          Date.parse(job.scheduledAt) < Date.now() - COLLECTIONS.maximumReminderAgeMs ||
          !customer ||
          customer.status === CustomerStatus.OnHold ||
          account(record.data, claim.customerId).overdue <= 0
        ) {
          await this.deliveries.finish(
            this.config.organizationId,
            claim,
            WhatsAppDeliveryStatus.Failed,
            null,
            'Reminder is no longer eligible for delivery.',
          );
          continue;
        }
        if (!(await this.deliveries.hasConsent(this.config.organizationId, customer.id))) {
          await this.deliveries.finish(
            this.config.organizationId,
            claim,
            WhatsAppDeliveryStatus.Failed,
            null,
            'WhatsApp consent was withdrawn before delivery.',
          );
          continue;
        }

        const invoice = record.data.invoices
          .filter((item) => item.customerId === customer.id && balance(item) > 0)
          .sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0];
        const amount = account(record.data, customer.id).outstanding / FINANCE.paisaPerRupee;
        const payload = {
          messaging_product: 'whatsapp',
          to: customer.phone.slice(1),
          type: 'template',
          template: {
            name: this.config.templateName,
            language: { code: this.config.templateLanguage },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: customer.name },
                  { type: 'text', text: invoice?.number ?? 'your invoices' },
                  { type: 'text', text: `Rs ${amount.toFixed(2)}` },
                ],
              },
            ],
          },
        };

        try {
          const response = await fetch(
            `https://graph.facebook.com/${this.config.graphVersion}/${this.config.phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${this.config.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
            },
          );
          if (!response.ok) {
            await this.deliveries.finish(
              this.config.organizationId,
              claim,
              WhatsAppDeliveryStatus.Failed,
              null,
              `Meta API returned HTTP ${response.status}.`,
            );
            continue;
          }
          const result = META_RESPONSE_SCHEMA.parse(await response.json());
          await this.deliveries.finish(
            this.config.organizationId,
            claim,
            WhatsAppDeliveryStatus.Accepted,
            result.messages[0]!.id,
          );
        } catch (error) {
          await this.deliveries.finish(
            this.config.organizationId,
            claim,
            WhatsAppDeliveryStatus.Unknown,
            null,
            error instanceof Error ? error.message : 'Delivery outcome is unknown.',
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
