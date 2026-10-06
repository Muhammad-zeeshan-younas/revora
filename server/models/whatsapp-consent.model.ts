import { EntitySchema } from 'typeorm';

export interface WhatsAppConsentRecord {
  organizationId: string;
  customerId: string;
  source: string;
  recordedBy: string;
  recordedAt: string;
}

export const WhatsAppConsentEntity = new EntitySchema<WhatsAppConsentRecord>({
  name: 'WhatsAppConsent',
  tableName: 'whatsapp_consents',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    customerId: { type: 'varchar', primary: true },
    source: { type: 'varchar' },
    recordedBy: { type: 'varchar' },
    recordedAt: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Customer',
      columnNames: ['organizationId', 'customerId'],
      referencedColumnNames: ['organizationId', 'id'],
      onDelete: 'CASCADE',
    },
  ],
});
