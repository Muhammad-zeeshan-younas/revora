import { EntitySchema } from 'typeorm';
import { WhatsAppDeliveryStatus } from '../../shared/enums';

export interface WhatsAppStatusEventRecord {
  messageId: string;
  status: WhatsAppDeliveryStatus;
  updatedAt: string;
}

export const WhatsAppStatusEventEntity = new EntitySchema<WhatsAppStatusEventRecord>({
  name: 'WhatsAppStatusEvent',
  tableName: 'whatsapp_status_events',
  columns: {
    messageId: { type: 'varchar', primary: true },
    status: { type: 'varchar', primary: true },
    updatedAt: { type: 'varchar' },
  },
});
