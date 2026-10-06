import { EntitySchema } from 'typeorm';

export interface PasswordResetRecord {
  id: string;
  userId: string;
  expiresAt: string;
}

export const PasswordResetEntity = new EntitySchema<PasswordResetRecord>({
  name: 'PasswordReset',
  tableName: 'password_resets',
  columns: {
    id: { type: 'varchar', primary: true },
    userId: { type: 'varchar' },
    expiresAt: { type: 'varchar' },
  },
  foreignKeys: [
    { target: 'User', columnNames: ['userId'], referencedColumnNames: ['id'], onDelete: 'CASCADE' },
  ],
  indices: [{ columns: ['userId'] }],
});
