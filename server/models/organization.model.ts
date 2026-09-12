import { EntitySchema } from 'typeorm';

export interface OrganizationRecord {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  revision: number;
}

export const OrganizationEntity = new EntitySchema<OrganizationRecord>({
  name: 'Organization',
  tableName: 'organizations',
  columns: {
    id: { type: 'varchar', primary: true },
    name: { type: 'varchar' },
    currency: { type: 'varchar' },
    timezone: { type: 'varchar' },
    revision: { type: 'integer' },
  },
  foreignKeys: [],
  uniques: [],
  indices: [],
  checks: [{ expression: '"revision" >= 0' }],
});
