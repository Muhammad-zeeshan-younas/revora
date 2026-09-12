import { EntitySchema } from 'typeorm';
import type { Workspace } from '../../shared/schema';

type ReminderJob = Workspace['jobs'][number];
export interface ReminderJobRecord extends ReminderJob {
  organizationId: string;
  sortOrder: number;
}

export const ReminderJobEntity = new EntitySchema<ReminderJobRecord>({
  name: 'ReminderJob',
  tableName: 'reminder_jobs',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer' },
    customerId: { type: 'varchar' },
    message: { type: 'varchar' },
    scheduledAt: { type: 'varchar' },
    status: { type: 'varchar' },
    createdBy: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    },
    {
      target: 'Customer',
      columnNames: ['organizationId', 'customerId'],
      referencedColumnNames: ['organizationId', 'id'],
      onDelete: 'RESTRICT',
    },
  ],
  uniques: [],
  indices: [{ columns: ['organizationId', 'customerId', 'scheduledAt'] }],
  checks: [{ expression: "\"status\" IN ('Queued', 'Prepared', 'Cancelled')" }],
});
