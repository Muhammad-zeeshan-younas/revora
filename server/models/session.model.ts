import { EntitySchema } from 'typeorm';

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
  demo: boolean;
}

export const SessionEntity = new EntitySchema<SessionRecord>({
  name: 'Session',
  tableName: 'sessions',
  columns: {
    id: { type: 'varchar', primary: true },
    userId: { type: 'varchar' },
    expiresAt: { type: 'varchar' },
    demo: { type: 'boolean' },
  },
  foreignKeys: [
    {
      target: 'User',
      columnNames: ['userId'],
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [],
  indices: [{ columns: ['userId'] }, { columns: ['expiresAt'] }],
  checks: [],
});
