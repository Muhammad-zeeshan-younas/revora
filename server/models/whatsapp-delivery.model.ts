import { EntitySchema } from 'typeorm';
import { WhatsAppDeliveryStatus } from '../../shared/enums';

export interface WhatsAppDeliveryRecord {
  organizationId: string;
  jobId: string;
  providerMessageId: string | null;
  status: WhatsAppDeliveryStatus;
  attemptCount: number;
  claimToken: string;
  lastError: string;
  updatedAt: string;
}

export const WhatsAppDeliveryEntity = new EntitySchema<WhatsAppDeliveryRecord>({
  name: 'WhatsAppDelivery',
  tableName: 'whatsapp_deliveries',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    jobId: { type: 'varchar', primary: true },
    providerMessageId: { type: 'varchar', nullable: true },
    status: { type: 'varchar' },
    attemptCount: { type: 'integer' },
    claimToken: { type: 'varchar' },
    lastError: { type: 'varchar' },
    updatedAt: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'ReminderJob',
      columnNames: ['organizationId', 'jobId'],
      referencedColumnNames: ['organizationId', 'id'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [{ columns: ['providerMessageId'] }],
});
