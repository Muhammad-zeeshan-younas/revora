import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsAppConsent1789200000010 implements MigrationInterface {
  name = 'WhatsAppConsent1789200000010';

  async up(runner: QueryRunner): Promise<void> {
    await runner.createTable(
      new Table({
        name: 'whatsapp_consents',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'customerId', type: 'varchar', isPrimary: true },
          { name: 'source', type: 'varchar' },
          { name: 'recordedBy', type: 'varchar' },
          { name: 'recordedAt', type: 'varchar' },
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId', 'customerId'],
            referencedTableName: 'customers',
            referencedColumnNames: ['organizationId', 'id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.dropTable('whatsapp_consents');
  }
}
