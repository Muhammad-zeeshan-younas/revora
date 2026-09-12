import { EntitySchema } from 'typeorm';
import type { Workspace } from '../../shared/schema';

type AuditEvent = Workspace['audit'][number];
export interface AuditEventRecord extends AuditEvent {
  organizationId: string;
  sortOrder: number;
}

export const AuditEventEntity = new EntitySchema<AuditEventRecord>({
  name: 'AuditEvent',
  tableName: 'audit_events',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer' },
    at: { type: 'varchar' },
    actor: { type: 'varchar' },
    action: { type: 'varchar' },
    detail: { type: 'varchar' },
    entityId: { type: 'varchar' },
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
  indices: [{ columns: ['organizationId', 'at'] }, { columns: ['organizationId', 'action'] }],
  checks: [],
});
