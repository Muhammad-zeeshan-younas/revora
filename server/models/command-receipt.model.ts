import { EntitySchema } from 'typeorm';

export interface CommandReceiptRecord {
  organizationId: string;
  requestId: string;
  payloadHash: string;
  revision: number;
  createdAt: string;
}

export const CommandReceiptEntity = new EntitySchema<CommandReceiptRecord>({
  name: 'CommandReceipt',
  tableName: 'command_receipts',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    requestId: { type: 'varchar', primary: true },
    payloadHash: { type: 'varchar' },
    revision: { type: 'integer' },
    createdAt: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
    },
  ],
  indices: [{ columns: ['createdAt'] }],
});
