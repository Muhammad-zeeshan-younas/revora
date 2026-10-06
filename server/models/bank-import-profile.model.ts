import { EntitySchema } from 'typeorm';

export interface BankImportProfileRecord {
  organizationId: string;
  name: string;
  columnsJson: string;
  dateFormat: string;
  updatedAt: string;
}

export const BankImportProfileEntity = new EntitySchema<BankImportProfileRecord>({
  name: 'BankImportProfile',
  tableName: 'bank_import_profiles',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    name: { type: 'varchar', primary: true },
    columnsJson: { type: 'varchar' },
    dateFormat: { type: 'varchar' },
    updatedAt: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
    },
  ],
});
