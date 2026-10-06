import { EntitySchema } from 'typeorm';
import type { BankReconciliation } from '../../shared/schema';
import { moneyTransformer, signedMoneyTransformer } from './money.transformer';

export interface BankReconciliationRecord extends Omit<BankReconciliation, 'issues'> {
  organizationId: string;
  sortOrder: number;
  issuesJson: string;
}

export const BankReconciliationEntity = new EntitySchema<BankReconciliationRecord>({
  name: 'BankReconciliation',
  tableName: 'bank_reconciliations',
  columns: {
    organizationId: { type: 'varchar', primary: true },
    id: { type: 'varchar', primary: true },
    sortOrder: { type: 'integer' },
    bank: { type: 'varchar' },
    periodStart: { type: 'varchar' },
    periodEnd: { type: 'varchar' },
    openingBalance: { type: 'bigint', transformer: signedMoneyTransformer },
    closingBalance: { type: 'bigint', transformer: signedMoneyTransformer },
    creditTotal: { type: 'bigint', transformer: moneyTransformer },
    debitTotal: { type: 'bigint', transformer: moneyTransformer },
    balanceDifference: { type: 'bigint', transformer: signedMoneyTransformer },
    matchedCount: { type: 'integer' },
    issuesJson: { type: 'text' },
    sourceName: { type: 'varchar' },
    createdAt: { type: 'varchar' },
    createdBy: { type: 'varchar' },
  },
  foreignKeys: [
    {
      target: 'Organization',
      columnNames: ['organizationId'],
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    },
  ],
  indices: [{ columns: ['organizationId', 'periodEnd'] }],
});
