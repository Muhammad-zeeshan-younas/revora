import { EntitySchema } from 'typeorm';

export interface EmailVerificationRecord {
  userId: string;
  verifiedAt: string;
  tokenId: string;
  expiresAt: string;
}

export const EmailVerificationEntity = new EntitySchema<EmailVerificationRecord>({
  name: 'EmailVerification',
  tableName: 'email_verifications',
  columns: {
    userId: { type: 'varchar', primary: true },
    verifiedAt: { type: 'varchar' },
    tokenId: { type: 'varchar' },
    expiresAt: { type: 'varchar' },
  },
  indices: [{ columns: ['tokenId'] }],
});
