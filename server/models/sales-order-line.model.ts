import { EntitySchema } from 'typeorm';
import { moneyTransformer } from './money.transformer';

export interface SalesOrderLineRecord {
  organizationId: string;
  orderId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
}

export const SalesOrderLineEntity = new EntitySchema<SalesOrderLineRecord>({
  name: 'SalesOrderLine',
  tableName: 'sales_order_lines',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    orderId: { type: 'varchar', primary: true },
    itemId: { type: 'varchar', primary: true },
    quantity: { type: 'integer' },
    unitPrice: { type: 'bigint', transformer: moneyTransformer },
  },
  foreignKeys: [
    {
      target: 'SalesOrder',
      columnNames: ['organizationId', 'orderId'],
      referencedColumnNames: ['organizationId', 'id'],
      onDelete: 'CASCADE',
    },
    {
      target: 'InventoryItem',
      columnNames: ['organizationId', 'itemId'],
      referencedColumnNames: ['organizationId', 'id'],
      onDelete: 'RESTRICT',
    },
  ],
  checks: [{ expression: '"quantity" > 0' }],
});
