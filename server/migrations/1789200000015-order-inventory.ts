import { Table, TableCheck, TableIndex, TableUnique } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderInventory1789200000015 implements MigrationInterface {
  name = 'OrderInventory1789200000015';

  async up(runner: QueryRunner): Promise<void> {
    await runner.createTable(
      new Table({
        name: 'inventory_items',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'sku', type: 'varchar' },
          { name: 'name', type: 'varchar' },
          { name: 'unitPrice', type: 'bigint' },
          { name: 'onHand', type: 'integer' },
          { name: 'reserved', type: 'integer' },
        ],
        uniques: [new TableUnique({ columnNames: ['organizationId', 'sku'] })],
        checks: [
          new TableCheck({ expression: '"onHand" >= 0' }),
          new TableCheck({ expression: '"reserved" >= 0' }),
          new TableCheck({ expression: '"reserved" <= "onHand"' }),
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId'],
            referencedTableName: 'organizations',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );
    await runner.createTable(
      new Table({
        name: 'sales_orders',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'sortOrder', type: 'integer' },
          { name: 'number', type: 'varchar' },
          { name: 'customerId', type: 'varchar' },
          { name: 'status', type: 'varchar' },
          { name: 'amount', type: 'bigint' },
          { name: 'createdAt', type: 'varchar' },
          { name: 'createdBy', type: 'varchar' },
          { name: 'invoiceId', type: 'varchar' },
        ],
        uniques: [new TableUnique({ columnNames: ['organizationId', 'number'] })],
        checks: [
          new TableCheck({ expression: '"amount" > 0' }),
          new TableCheck({ expression: "\"status\" IN ('Reserved', 'Fulfilled', 'Cancelled')" }),
        ],
        indices: [new TableIndex({ columnNames: ['organizationId', 'customerId', 'status'] })],
        foreignKeys: [
          {
            columnNames: ['organizationId'],
            referencedTableName: 'organizations',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['organizationId', 'customerId'],
            referencedTableName: 'customers',
            referencedColumnNames: ['organizationId', 'id'],
            onDelete: 'RESTRICT',
          },
        ],
      }),
    );
    await runner.createTable(
      new Table({
        name: 'sales_order_lines',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'orderId', type: 'varchar', isPrimary: true },
          { name: 'itemId', type: 'varchar', isPrimary: true },
          { name: 'quantity', type: 'integer' },
          { name: 'unitPrice', type: 'bigint' },
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId', 'orderId'],
            referencedTableName: 'sales_orders',
            referencedColumnNames: ['organizationId', 'id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['organizationId', 'itemId'],
            referencedTableName: 'inventory_items',
            referencedColumnNames: ['organizationId', 'id'],
            onDelete: 'RESTRICT',
          },
        ],
        checks: [new TableCheck({ expression: '"quantity" > 0' })],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.dropTable('sales_order_lines');
    await runner.dropTable('sales_orders');
    await runner.dropTable('inventory_items');
  }
}
