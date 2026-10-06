import { EntitySchema } from 'typeorm';

export enum SecurityEventKind {
  PasswordRejected = 'password_rejected',
  AuthenticatorRejected = 'authenticator_rejected',
  EmailVerificationRequired = 'email_verification_required',
}

export interface SecurityEventRecord {
  id: string;
  kind: SecurityEventKind;
  subjectHash: string;
  at: string;
}

export const SecurityEventEntity = new EntitySchema<SecurityEventRecord>({
  name: 'SecurityEvent',
  tableName: 'security_events',
  columns: {
    id: { type: 'varchar', primary: true },
    kind: { type: 'varchar' },
    subjectHash: { type: 'varchar' },
    at: { type: 'varchar' },
  },
  indices: [{ columns: ['at', 'kind'] }, { columns: ['subjectHash', 'at'] }],
});
