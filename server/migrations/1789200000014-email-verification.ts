import { Table, TableIndex } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { EmailVerificationEntity } from '../models/email-verification.model';

export class EmailVerification1789200000014 implements MigrationInterface {
  name = 'EmailVerification1789200000014';

  async up(runner: QueryRunner): Promise<void> {
    await runner.createTable(
      new Table({
        name: 'email_verifications',
        columns: [
          { name: 'userId', type: 'varchar', isPrimary: true },
          { name: 'verifiedAt', type: 'varchar' },
          { name: 'tokenId', type: 'varchar' },
          { name: 'expiresAt', type: 'varchar' },
        ],
        indices: [new TableIndex({ columnNames: ['tokenId'] })],
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
    const existing = (await runner.query('SELECT "id" FROM "users"')) as { id: string }[];
    const verifiedAt = new Date().toISOString();
    for (const user of existing) {
      await runner.manager
        .getRepository(EmailVerificationEntity)
        .insert({ userId: user.id, verifiedAt, tokenId: '', expiresAt: '' });
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.dropTable('email_verifications');
  }
}
