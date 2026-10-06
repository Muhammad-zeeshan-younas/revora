import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommandReceipts1789200000001 implements MigrationInterface {
  name = 'CommandReceipts1789200000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'command_receipts',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'requestId', type: 'varchar', isPrimary: true },
          { name: 'payloadHash', type: 'varchar' },
          { name: 'revision', type: 'integer' },
          { name: 'createdAt', type: 'varchar' },
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'organizations',
            onDelete: 'CASCADE',
          },
        ],
        indices: [{ columnNames: ['createdAt'] }],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('command_receipts');
  }
}
