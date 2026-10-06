import { EntitySchema } from 'typeorm';
import type { WriteOffRequest } from '../../shared/schema';
import { moneyTransformer } from './money.transformer';

export interface WriteOffRequestRecord extends WriteOffRequest {
  organizationId: string;
  sortOrder: number;
}

export const WriteOffRequestEntity = new EntitySchema<WriteOffRequestRecord>({
  name: 'WriteOffRequest',
  tableName: 'write_off_requests',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer' },
    invoiceId: { type: 'varchar' },
    amount: { type: 'bigint', transformer: moneyTransformer },
    reason: { type: 'varchar' },
    status: { type: 'varchar' },
    requestedAt: { type: 'varchar' },
    requestedById: { type: 'varchar' },
    requestedBy: { type: 'varchar' },
    reviewedAt: { type: 'varchar' },
    reviewedById: { type: 'varchar' },
    reviewedBy: { type: 'varchar' },
    reviewReason: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Invoice',
      columnNames: ['organizationId', 'invoiceId'],
      referencedColumnNames: ['organizationId', 'id'],
      onDelete: 'RESTRICT',
    },
  ],
  indices: [
    { columns: ['organizationId', 'invoiceId'] },
    { columns: ['organizationId', 'status'] },
  ],
});
