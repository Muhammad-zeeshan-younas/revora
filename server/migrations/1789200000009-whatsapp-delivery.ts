import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsAppDelivery1789200000009 implements MigrationInterface {
  name = 'WhatsAppDelivery1789200000009';

  async up(runner: QueryRunner): Promise<void> {
    await runner.createTable(
      new Table({
        name: 'whatsapp_deliveries',
        columns: [
          { name: 'organizationId', type: 'varchar', isPrimary: true },
          { name: 'jobId', type: 'varchar', isPrimary: true },
          { name: 'providerMessageId', type: 'varchar', isNullable: true },
          { name: 'status', type: 'varchar' },
          { name: 'attemptCount', type: 'integer' },
          { name: 'claimToken', type: 'varchar' },
          { name: 'lastError', type: 'varchar' },
          { name: 'updatedAt', type: 'varchar' },
        ],
        foreignKeys: [
          {
            columnNames: ['organizationId', 'jobId'],
            referencedTableName: 'reminder_jobs',
            referencedColumnNames: ['organizationId', 'id'],
            onDelete: 'RESTRICT',
          },
        ],
        uniques: [{ columnNames: ['providerMessageId'] }],
      }),
    );
    await runner.createTable(
      new Table({
        name: 'whatsapp_webhook_events',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'receivedAt', type: 'varchar' },
          { name: 'claimToken', type: 'varchar' },
        ],
      }),
    );
    await runner.createTable(
      new Table({
        name: 'whatsapp_status_events',
        columns: [
          { name: 'messageId', type: 'varchar', isPrimary: true },
          { name: 'status', type: 'varchar', isPrimary: true },
          { name: 'updatedAt', type: 'varchar' },
        ],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.dropTable('whatsapp_status_events');
    await runner.dropTable('whatsapp_webhook_events');
    await runner.dropTable('whatsapp_deliveries');
  }
}
