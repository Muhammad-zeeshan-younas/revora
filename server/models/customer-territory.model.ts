import { EntitySchema } from 'typeorm';

export interface CustomerTerritoryRecord {
  organizationId: string;
  customerId: string;
  userId: string;
}

export const CustomerTerritoryEntity = new EntitySchema<CustomerTerritoryRecord>({
  name: 'CustomerTerritory',
  tableName: 'customer_territories',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    customerId: { type: 'varchar', primary: true },
    userId: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Customer',
      columnNames: ['organizationId', 'customerId'],
      referencedColumnNames: ['organizationId', 'id'],
      onDelete: 'CASCADE',
    },
    {
      target: 'User',
      columnNames: ['userId'],
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    },
  ],
  indices: [{ columns: ['organizationId', 'userId'] }],
});
