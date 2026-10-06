import { EntitySchema } from 'typeorm';

export interface WhatsAppWebhookEventRecord {
  id: string;
  receivedAt: string;
  claimToken: string;
}

export const WhatsAppWebhookEventEntity = new EntitySchema<WhatsAppWebhookEventRecord>({
  name: 'WhatsAppWebhookEvent',
  tableName: 'whatsapp_webhook_events',
  columns: {
    id: { type: 'varchar', primary: true },
    receivedAt: { type: 'varchar' },
    claimToken: { type: 'varchar' },
  },
});
