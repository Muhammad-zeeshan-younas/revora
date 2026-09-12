import { EntitySchema } from 'typeorm';
import type { Invoice } from '../../shared/schema';
import { moneyTransformer } from './money.transformer';

export interface InvoiceRecord extends Invoice {
  organizationId: string;
  sortOrder: number;
  numberKey: string;
}

export const InvoiceEntity = new EntitySchema<InvoiceRecord>({
  name: 'Invoice',
  tableName: 'invoices',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer' },
    number: { type: 'varchar' },
    numberKey: { type: 'varchar' },
    customerId: { type: 'varchar' },
    issuedAt: { type: 'varchar' },
    dueAt: { type: 'varchar' },
    amount: { type: 'bigint', transformer: moneyTransformer },
    paid: { type: 'bigint', transformer: moneyTransformer },
    status: { type: 'varchar' },
    reference: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    },
    {
      target: 'Customer',
      columnNames: ['organizationId', 'customerId'],
      referencedColumnNames: ['organizationId', 'id'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [
    { columns: ['organizationId', 'numberKey'] },
    { columns: ['organizationId', 'id', 'customerId'] },
  ],
  indices: [{ columns: ['organizationId', 'customerId', 'dueAt'] }],
  checks: [
    { expression: '"amount" > 0' },
    { expression: '"paid" <= "amount"' },
    { expression: '"dueAt" >= "issuedAt"' },
    { expression: "\"status\" IN ('Open', 'Disputed', 'Draft', 'Written off')" },
    { expression: '"amount" BETWEEN 0 AND 1000000000000' },
    { expression: '"paid" BETWEEN 0 AND 1000000000000' },
  ],
});
