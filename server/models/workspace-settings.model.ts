import { EntitySchema } from 'typeorm';
import type { Workspace } from '../../shared/schema';

export interface WorkspaceSettingsRecord extends WorkspaceSettings {
  organizationId: string;
}
type WorkspaceSettings = Workspace['settings'];

export const WorkspaceSettingsEntity = new EntitySchema<WorkspaceSettingsRecord>({
  name: 'WorkspaceSettings',
  tableName: 'workspace_settings',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    remindersEnabled: { type: 'boolean' },
    reminderHour: { type: 'integer' },
    dailyLimit: { type: 'integer' },
    template: { type: 'varchar' },
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
  indices: [],
  checks: [
    { expression: '"reminderHour" BETWEEN 8 AND 18' },
    { expression: '"dailyLimit" BETWEEN 1 AND 100' },
  ],
});
