import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ManagementReports1789200000012 implements MigrationInterface {
  name = 'ManagementReports1789200000012';

  async up(runner: QueryRunner): Promise<void> {
    await runner.createTable(
      new Table({
        name: 'management_reports',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'month', type: 'varchar', isPrimary: true },
          { name: 'generatedAt', type: 'varchar' },
          { name: 'reportJson', type: 'text' },
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
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.dropTable('management_reports');
  }
}
