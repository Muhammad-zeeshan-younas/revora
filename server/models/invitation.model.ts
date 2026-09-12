import { EntitySchema } from 'typeorm';
import type { Role } from '../../shared/enums';

export interface InviteRecord {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export const InviteEntity = new EntitySchema<InviteRecord>({
  name: 'Invite',
  tableName: 'invitations',
  columns: {
    id: { type: 'varchar', primary: true },
    organizationId: { type: 'varchar' },
    email: { type: 'varchar' },
    role: { type: 'varchar' },
    expiresAt: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [],
  indices: [{ columns: ['organizationId'] }, { columns: ['expiresAt'] }],
  checks: [{ expression: "\"role\" IN ('Admin', 'Accountant', 'Collections', 'Sales', 'Viewer')" }],
});
