import { EntitySchema } from 'typeorm';
import type { Role } from '../../shared/enums';

export interface MemberRecord {
  organizationId: string;
  userId: string;
  role: Role;
  sortOrder: number;
}

export const MemberEntity = new EntitySchema<MemberRecord>({
  name: 'Member',
  tableName: 'members',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    userId: { type: 'varchar', primary: true },
    role: { type: 'varchar' },
    sortOrder: { type: 'integer' },
  },
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    },
    {
      target: 'User',
      columnNames: ['organizationId', 'userId'],
      referencedColumnNames: ['organizationId', 'id'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [],
  indices: [],
  checks: [
    {
      expression: "\"role\" IN ('Owner', 'Admin', 'Accountant', 'Collections', 'Sales', 'Viewer')",
    },
  ],
});
