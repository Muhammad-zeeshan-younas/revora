import { EntitySchema } from 'typeorm';
import type { Customer } from '../../shared/schema';
import { moneyTransformer } from './money.transformer';

export interface CustomerRecord extends Customer {
  organizationId: string;
  sortOrder: number;
  nameKey: string;
}

export const CustomerEntity = new EntitySchema<CustomerRecord>({
  name: 'Customer',
  tableName: 'customers',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer' },
    name: { type: 'varchar' },
    nameKey: { type: 'varchar' },
    contact: { type: 'varchar' },
    email: { type: 'varchar' },
    phone: { type: 'varchar' },
    city: { type: 'varchar' },
    taxId: { type: 'varchar' },
    salesperson: { type: 'varchar' },
    creditLimit: { type: 'bigint', transformer: moneyTransformer },
    terms: { type: 'integer' },
    status: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [{ columns: ['organizationId', 'nameKey'] }],
  indices: [],
  checks: [
    { expression: '"terms" BETWEEN 0 AND 365' },
    { expression: "\"status\" IN ('Active', 'On hold')" },
    { expression: '"creditLimit" BETWEEN 0 AND 1000000000000' },
  ],
});
