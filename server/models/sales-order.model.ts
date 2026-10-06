import { EntitySchema } from 'typeorm';
import { OrderStatus } from '../../shared/enums';
import { moneyTransformer } from './money.transformer';

export interface SalesOrderRecord {
  organizationId: string;
  id: string;
  sortOrder: number;
  number: string;
  customerId: string;
  status: OrderStatus;
  amount: number;
  createdAt: string;
  createdBy: string;
  invoiceId: string;
}

export const SalesOrderEntity = new EntitySchema<SalesOrderRecord>({
  name: 'SalesOrder',
  tableName: 'sales_orders',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer' },
    number: { type: 'varchar' },
    customerId: { type: 'varchar' },
    status: { type: 'varchar' },
    amount: { type: 'bigint', transformer: moneyTransformer },
    createdAt: { type: 'varchar' },
    createdBy: { type: 'varchar' },
    invoiceId: { type: 'varchar' },
  },
  uniques: [{ columns: ['organizationId', 'number'] }],
  indices: [{ columns: ['organizationId', 'customerId', 'status'] }],
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
    },
    {
      target: 'Customer',
      columnNames: ['organizationId', 'customerId'],
      referencedColumnNames: ['organizationId', 'id'],
      onDelete: 'RESTRICT',
    },
  ],
  checks: [
    { expression: '"amount" > 0' },
    { expression: "\"status\" IN ('Reserved', 'Fulfilled', 'Cancelled')" },
  ],
});
