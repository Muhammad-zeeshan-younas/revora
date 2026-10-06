import { EntitySchema } from 'typeorm';

export interface UserMfaRecord {
  userId: string;
  secretCiphertext: string;
  pendingCiphertext: string;
  pendingExpiresAt: string;
  lastUsedStep: number;
}

export const UserMfaEntity = new EntitySchema<UserMfaRecord>({
  name: 'UserMfa',
  tableName: 'user_mfa',
  columns: {
    userId: { type: 'varchar', primary: true },
    secretCiphertext: { type: 'text' },
    pendingCiphertext: { type: 'text' },
    pendingExpiresAt: { type: 'varchar' },
    lastUsedStep: { type: 'integer' },
  },
});
