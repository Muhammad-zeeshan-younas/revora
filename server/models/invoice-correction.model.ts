import { EntitySchema } from 'typeorm';
import type { InvoiceCorrection } from '../../shared/schema';
import { moneyTransformer } from './money.transformer';

export interface InvoiceCorrectionRecord extends InvoiceCorrection {
  organizationId: string;
  sortOrder: number;
}

export const InvoiceCorrectionEntity = new EntitySchema<InvoiceCorrectionRecord>({
  name: 'InvoiceCorrection',
  tableName: 'invoice_corrections',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer' },
    invoiceId: { type: 'varchar' },
    kind: { type: 'varchar' },
    direction: { type: 'varchar' },
    amount: { type: 'bigint', transformer: moneyTransformer },
    number: { type: 'varchar' },
    reason: { type: 'varchar' },
    createdAt: { type: 'varchar' },
    createdBy: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Invoice',
      columnNames: ['organizationId', 'invoiceId'],
      referencedColumnNames: ['organizationId', 'id'],
      onDelete: 'RESTRICT',
    },
  ],
  indices: [{ columns: ['organizationId', 'invoiceId'] }],
});
