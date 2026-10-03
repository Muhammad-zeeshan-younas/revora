import { describe, expect, it } from 'vitest';
import { createDevelopmentWorkspaces } from '../server/database/development-fixtures';
import { customerAccounts, balance } from '../shared/finance';

describe('customer account summaries', () => {
  it('preserves ledger balances, credit boundaries, and independent customer groups', () => {
    const workspace = createDevelopmentWorkspaces(new Date('2026-09-12T07:00:00Z'))[0];
    if (!workspace) {
      throw new Error('Development workspace missing.');
    }
    const rows = customerAccounts(workspace, '2026-09-12');
    const accounts = new Map(rows.map((customer) => [customer.id, customer]));
    expect(accounts.get('dev-partial')).toMatchObject({
      outstanding: 10_000_000,
      overdue: 4_000_000,
      days: 10,
    });
    expect(accounts.get('dev-reversed')).toMatchObject({
      outstanding: 5_000_000,
      overdue: 5_000_000,
      days: 45,
    });
    expect(accounts.get('dev-today')).toMatchObject({
      outstanding: 7_500_000,
      overdue: 0,
      available: 0,
      utilization: 100,
    });
    expect(accounts.get('dev-empty')).toMatchObject({
      outstanding: 0,
      overdue: 0,
      days: 0,
      broken: 0,
    });
    expect(accounts.get('dev-hold')).toMatchObject({
      outstanding: 2_500_000,
      available: -2_500_000,
      utilization: 100,
    });
    expect(rows.reduce((sum, customer) => sum + customer.outstanding, 0)).toBe(
      workspace.invoices.reduce((sum, invoice) => sum + balance(invoice), 0),
    );
  });
});
