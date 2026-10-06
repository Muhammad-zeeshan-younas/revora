import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BankReconciliations1789200000006 implements MigrationInterface {
  name = 'BankReconciliations1789200000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'bank_reconciliations',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'sortOrder', type: 'integer' },
          { name: 'bank', type: 'varchar' },
          { name: 'periodStart', type: 'varchar' },
          { name: 'periodEnd', type: 'varchar' },
          { name: 'openingBalance', type: 'bigint' },
          { name: 'closingBalance', type: 'bigint' },
          { name: 'creditTotal', type: 'bigint' },
          { name: 'debitTotal', type: 'bigint' },
          { name: 'balanceDifference', type: 'bigint' },
          { name: 'matchedCount', type: 'integer' },
          { name: 'issuesJson', type: 'text' },
          { name: 'sourceName', type: 'varchar' },
          { name: 'createdAt', type: 'varchar' },
          { name: 'createdBy', type: 'varchar' },
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'organizations',
            onDelete: 'RESTRICT',
          },
        ],
        indices: [{ columnNames: ['organizationId', 'periodEnd'] }],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('bank_reconciliations');
  }
}
