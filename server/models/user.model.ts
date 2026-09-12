import { EntitySchema } from 'typeorm';

export interface UserRecord {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  name: string;
}

export const UserEntity = new EntitySchema<UserRecord>({
  name: 'User',
  tableName: 'users',
  columns: {
    id: { type: 'varchar', primary: true },
    organizationId: { type: 'varchar' },
    email: { type: 'varchar' },
    passwordHash: { type: 'varchar' },
    name: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [{ columns: ['email'] }, { columns: ['organizationId', 'id'] }],
  indices: [],
  checks: [],
});
