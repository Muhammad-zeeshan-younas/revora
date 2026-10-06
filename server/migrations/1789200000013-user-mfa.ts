import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserMfa1789200000013 implements MigrationInterface {
  name = 'UserMfa1789200000013';

  async up(runner: QueryRunner): Promise<void> {
    await runner.createTable(
      new Table({
        name: 'user_mfa',
        columns: [
          { name: 'userId', type: 'varchar', isPrimary: true },
          { name: 'secretCiphertext', type: 'text' },
          { name: 'pendingCiphertext', type: 'text' },
          { name: 'pendingExpiresAt', type: 'varchar' },
          { name: 'lastUsedStep', type: 'integer' },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.dropTable('user_mfa');
  }
}
