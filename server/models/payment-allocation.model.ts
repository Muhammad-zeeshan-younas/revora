import { EntitySchema } from 'typeorm';

import { moneyTransformer } from './money.transformer';

export interface PaymentAllocationRecord {
  organizationId: string;
  paymentId: string;
  sortOrder: number;
  customerId: string;
  invoiceId: string;
  amount: number;
}

export const PaymentAllocationEntity = new EntitySchema<PaymentAllocationRecord>({
  name: 'PaymentAllocation',
  tableName: 'payment_allocations',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    paymentId: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer', primary: true },
    customerId: { type: 'varchar' },
    invoiceId: { type: 'varchar' },
    amount: { type: 'bigint', transformer: moneyTransformer },
  },
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    },
    {
      target: 'Payment',
      columnNames: ['organizationId', 'paymentId', 'customerId'],
      referencedColumnNames: ['organizationId', 'id', 'customerId'],
      onDelete: 'RESTRICT',
    },
    {
      target: 'Invoice',
      columnNames: ['organizationId', 'invoiceId', 'customerId'],
      referencedColumnNames: ['organizationId', 'id', 'customerId'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [],
  indices: [{ columns: ['organizationId', 'invoiceId'] }],
  checks: [{ expression: '"amount" > 0' }, { expression: '"amount" BETWEEN 0 AND 1000000000000' }],
});
