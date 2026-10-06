import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordResets1789200000002 implements MigrationInterface {
  name = 'PasswordResets1789200000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'password_resets',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar' },
          { name: 'expiresAt', type: 'varchar' },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'users',
            onDelete: 'CASCADE',
          },
        ],
        indices: [{ columnNames: ['userId'] }],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('password_resets');
  }
}
