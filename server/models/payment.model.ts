import { EntitySchema } from 'typeorm';
import type { Payment } from '../../shared/schema';
import { moneyTransformer } from './money.transformer';

export interface PaymentRecord extends Omit<Payment, 'allocations' | 'customerId'> {
  organizationId: string;
  sortOrder: number;
  customerId: string | null;
  referenceKey: string;
}

export const PaymentEntity = new EntitySchema<PaymentRecord>({
  name: 'Payment',
  tableName: 'payments',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer' },
    customerId: { type: 'varchar', nullable: true },
    amount: { type: 'bigint', transformer: moneyTransformer },
    date: { type: 'varchar' },
    reference: { type: 'varchar' },
    referenceKey: { type: 'varchar' },
    description: { type: 'varchar' },
    bank: { type: 'varchar' },
    method: { type: 'varchar' },
    status: { type: 'varchar' },
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
    { columns: ['organizationId', 'bank', 'referenceKey'] },
    { columns: ['organizationId', 'id', 'customerId'] },
  ],
  indices: [{ columns: ['organizationId', 'customerId', 'date'] }],
  checks: [
    { expression: '"amount" > 0' },
    { expression: "\"status\" IN ('Unmatched', 'Partial', 'Matched', 'Reversed')" },
    { expression: '"amount" BETWEEN 0 AND 1000000000000' },
  ],
});
