import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoiceCorrections1789200000005 implements MigrationInterface {
  name = 'InvoiceCorrections1789200000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'invoice_corrections',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'sortOrder', type: 'integer' },
          { name: 'invoiceId', type: 'varchar' },
          { name: 'kind', type: 'varchar' },
          { name: 'direction', type: 'varchar' },
          { name: 'amount', type: 'bigint' },
          { name: 'number', type: 'varchar' },
          { name: 'reason', type: 'varchar' },
          { name: 'createdAt', type: 'varchar' },
          { name: 'createdBy', type: 'varchar' },
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId', 'invoiceId'],
            referencedColumnNames: ['organizationId', 'id'],
            referencedTableName: 'invoices',
            onDelete: 'RESTRICT',
          },
        ],
        indices: [{ columnNames: ['organizationId', 'invoiceId'] }],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'write_off_requests',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'sortOrder', type: 'integer' },
          { name: 'invoiceId', type: 'varchar' },
          { name: 'amount', type: 'bigint' },
          { name: 'reason', type: 'varchar' },
          { name: 'status', type: 'varchar' },
          { name: 'requestedAt', type: 'varchar' },
          { name: 'requestedById', type: 'varchar' },
          { name: 'requestedBy', type: 'varchar' },
          { name: 'reviewedAt', type: 'varchar' },
          { name: 'reviewedById', type: 'varchar' },
          { name: 'reviewedBy', type: 'varchar' },
          { name: 'reviewReason', type: 'varchar' },
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId', 'invoiceId'],
            referencedColumnNames: ['organizationId', 'id'],
            referencedTableName: 'invoices',
            onDelete: 'RESTRICT',
          },
        ],
        indices: [
          { columnNames: ['organizationId', 'invoiceId'] },
          { columnNames: ['organizationId', 'status'] },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('write_off_requests');
    await queryRunner.dropTable('invoice_corrections');
  }
}
