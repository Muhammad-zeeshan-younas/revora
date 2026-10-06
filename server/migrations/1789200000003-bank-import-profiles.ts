import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BankImportProfiles1789200000003 implements MigrationInterface {
  name = 'BankImportProfiles1789200000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'bank_import_profiles',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'name', type: 'varchar', isPrimary: true },
          { name: 'columnsJson', type: 'varchar' },
          { name: 'dateFormat', type: 'varchar' },
          { name: 'updatedAt', type: 'varchar' },
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'organizations',
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('bank_import_profiles');
  }
}
