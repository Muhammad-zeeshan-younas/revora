import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkerLeases1789200000004 implements MigrationInterface {
  name = 'WorkerLeases1789200000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'worker_leases',
        columns: [
          { name: 'name', type: 'varchar', isPrimary: true },
          { name: 'ownerToken', type: 'varchar' },
          { name: 'expiresAt', type: 'varchar' },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('worker_leases');
  }
}
