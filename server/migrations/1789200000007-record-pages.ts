import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RecordPages1789200000007 implements MigrationInterface {
  name = 'RecordPages1789200000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['customers', 'invoices', 'payments']) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_${table}_organization_order" ON "${table}" ("organizationId", "sortOrder")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_${table}_organization_status_order" ON "${table}" ("organizationId", "status", "sortOrder")`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['customers', 'invoices', 'payments']) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_${table}_organization_status_order"`);
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_${table}_organization_order"`);
    }
  }
}
