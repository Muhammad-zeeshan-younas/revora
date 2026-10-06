import { EntitySchema } from 'typeorm';

export interface ManagementReportRecord {
  organizationId: string;
  month: string;
  generatedAt: string;
  reportJson: string;
}

export const ManagementReportEntity = new EntitySchema<ManagementReportRecord>({
  name: 'ManagementReport',
  tableName: 'management_reports',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    month: { type: 'varchar', primary: true },
    generatedAt: { type: 'varchar' },
    reportJson: { type: 'text' },
  },
});
