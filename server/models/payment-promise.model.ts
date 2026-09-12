import { EntitySchema } from 'typeorm';
import type { PromiseToPay } from '../../shared/schema';
import { moneyTransformer } from './money.transformer';

export interface PaymentPromiseRecord extends Omit<PromiseToPay, 'baselineAllocations'> {
  organizationId: string;
  sortOrder: number;
}

export const PaymentPromiseEntity = new EntitySchema<PaymentPromiseRecord>({
  name: 'PaymentPromise',
  tableName: 'payment_promises',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer' },
    customerId: { type: 'varchar' },
    amount: { type: 'bigint', transformer: moneyTransformer },
    date: { type: 'varchar' },
    createdAt: { type: 'varchar' },
    status: { type: 'varchar' },
    note: { type: 'varchar' },
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
  uniques: [{ columns: ['organizationId', 'id', 'customerId'] }],
  indices: [{ columns: ['organizationId', 'customerId', 'status'] }],
  checks: [
    { expression: '"amount" > 0' },
    { expression: "\"status\" IN ('Pending', 'Partially kept', 'Kept', 'Broken', 'Cancelled')" },
    { expression: '"amount" BETWEEN 0 AND 1000000000000' },
  ],
});
