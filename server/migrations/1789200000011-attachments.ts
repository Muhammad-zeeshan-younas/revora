import { Table, TableIndex, TableUnique } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Attachments1789200000011 implements MigrationInterface {
  name = 'Attachments1789200000011';

  async up(runner: QueryRunner): Promise<void> {
    await runner.createTable(
      new Table({
        name: 'attachments',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'organizationId', type: 'varchar' },
          { name: 'target', type: 'varchar' },
          { name: 'targetId', type: 'varchar' },
          { name: 'customerId', type: 'varchar', isNullable: true },
          { name: 'fileName', type: 'varchar' },
          { name: 'mediaType', type: 'varchar' },
          { name: 'byteLength', type: 'integer' },
          { name: 'sha256', type: 'varchar' },
          { name: 'contentBase64', type: 'text' },
          { name: 'uploadedBy', type: 'varchar' },
          { name: 'uploadedAt', type: 'varchar' },
        ],
        uniques: [
          new TableUnique({ columnNames: ['organizationId', 'target', 'targetId', 'sha256'] }),
        ],
        indices: [
          new TableIndex({ columnNames: ['organizationId', 'target', 'targetId', 'uploadedAt'] }),
          new TableIndex({ columnNames: ['organizationId', 'customerId'] }),
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
    await runner.dropTable('attachments');
  }
}
