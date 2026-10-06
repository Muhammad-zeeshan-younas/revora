import { EntitySchema } from 'typeorm';
import { moneyTransformer } from './money.transformer';

export interface InventoryItemRecord {
  organizationId: string;
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  onHand: number;
  reserved: number;
}

export const InventoryItemEntity = new EntitySchema<InventoryItemRecord>({
  name: 'InventoryItem',
  tableName: 'inventory_items',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sku: { type: 'varchar' },
    name: { type: 'varchar' },
    unitPrice: { type: 'bigint', transformer: moneyTransformer },
    onHand: { type: 'integer' },
    reserved: { type: 'integer' },
  },
  uniques: [{ columns: ['organizationId', 'sku'] }],
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
    },
  ],
  checks: [
    { expression: '"onHand" >= 0' },
    { expression: '"reserved" >= 0' },
    { expression: '"reserved" <= "onHand"' },
  ],
});
