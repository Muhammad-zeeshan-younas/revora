import { Table, TableIndex } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Monitoring1789200000016 implements MigrationInterface {
  name = 'Monitoring1789200000016';

  async up(runner: QueryRunner): Promise<void> {
    await runner.createTable(
      new Table({
        name: 'worker_runs',
        columns: [
          { name: 'name', type: 'varchar', isPrimary: true },
          { name: 'lastStartedAt', type: 'varchar' },
          { name: 'lastFinishedAt', type: 'varchar' },
          { name: 'lastSuccessAt', type: 'varchar' },
          { name: 'lastError', type: 'varchar' },
        ],
      }),
    );
    await runner.createTable(
      new Table({
        name: 'security_events',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'kind', type: 'varchar' },
          { name: 'subjectHash', type: 'varchar' },
          { name: 'at', type: 'varchar' },
        ],
        indices: [
          new TableIndex({ columnNames: ['at', 'kind'] }),
          new TableIndex({ columnNames: ['subjectHash', 'at'] }),
        ],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.dropTable('security_events');
    await runner.dropTable('worker_runs');
  }
}
