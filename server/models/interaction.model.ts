import { EntitySchema } from 'typeorm';
import type { Interaction } from '../../shared/schema';

export interface InteractionRecord extends Interaction {
  organizationId: string;
  sortOrder: number;
}

export const InteractionEntity = new EntitySchema<InteractionRecord>({
  name: 'Interaction',
  tableName: 'interactions',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer' },
    customerId: { type: 'varchar' },
    at: { type: 'varchar' },
    author: { type: 'varchar' },
    channel: { type: 'varchar' },
    message: { type: 'varchar' },
    outcome: { type: 'varchar' },
    nextAction: { type: 'varchar' },
    direction: { type: 'varchar' },
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
  indices: [{ columns: ['organizationId', 'customerId', 'at'] }],
  checks: [],
});
