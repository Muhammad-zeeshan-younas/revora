import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerTerritories1789200000008 implements MigrationInterface {
  name = 'CustomerTerritories1789200000008';

  async up(runner: QueryRunner): Promise<void> {
    await runner.createTable(
      new Table({
        name: 'customer_territories',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'customerId', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar' },
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId', 'customerId'],
            referencedTableName: 'customers',
            referencedColumnNames: ['organizationId', 'id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          },
        ],
        indices: [
          { name: 'IDX_customer_territories_user', columnNames: ['organizationId', 'userId'] },
        ],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.dropTable('customer_territories');
  }
}
