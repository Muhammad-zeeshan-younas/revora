import { EntitySchema } from 'typeorm';

import { moneyTransformer } from './money.transformer';

export interface PromiseBaselineRecord {
  organizationId: string;
  promiseId: string;
  paymentId: string;
  customerId: string;
  amount: number;
  sortOrder: number;
}

export const PromiseBaselineEntity = new EntitySchema<PromiseBaselineRecord>({
  name: 'PromiseBaseline',
  tableName: 'promise_baselines',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    promiseId: { type: 'varchar', primary: true },
    paymentId: { type: 'varchar', primary: true },
    customerId: { type: 'varchar' },
    amount: { type: 'bigint', transformer: moneyTransformer },
    sortOrder: { type: 'integer' },
  },
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    },
    {
      target: 'PaymentPromise',
      columnNames: ['organizationId', 'promiseId', 'customerId'],
      referencedColumnNames: ['organizationId', 'id', 'customerId'],
      onDelete: 'RESTRICT',
    },
    {
      target: 'Payment',
      columnNames: ['organizationId', 'paymentId', 'customerId'],
      referencedColumnNames: ['organizationId', 'id', 'customerId'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [],
  indices: [],
  checks: [{ expression: '"amount" BETWEEN 0 AND 1000000000000' }],
});
