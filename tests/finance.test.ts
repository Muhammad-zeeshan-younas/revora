import { ImportKind } from '../shared/enums';
import {
  CommandType,
  CustomerStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  PromiseStatus,
  ReplyCategory,
  Role,
} from '../shared/enums';
import { describe, expect, it } from 'vitest';
import {
  account,
  aging,
  balance,
  formatMoney,
  invoiceStatus,
  metrics,
  offsetDate,
  operationsMetrics,
  suggestMatch,
  toPaisa,
} from '../shared/finance';
import { emptyWorkspace } from '../shared/seed';
import type { Customer, Invoice, Payment } from '../shared/schema';
import { commandSchema } from '../shared/schema';
import { applyCommand } from '../shared/domain';
import { analyzeReply } from '../shared/assistant';
import { csvExport, importCommand, parseCsv } from '../shared/csv';

const date = '2026-09-11';
const now = new Date('2026-09-11T08:00:00.000Z');
const customer: Customer = {
  id: 'customer-a',
  name: 'Ali Traders',
  contact: 'Ali Hassan',
  email: 'ali@example.com',
  phone: '+923001234567',
  city: 'Lahore',
  taxId: '',
  salesperson: 'Adeel Khan',
  creditLimit: 20000000,
  terms: 30,
  status: CustomerStatus.Active,
};
const invoice: Invoice = {
  id: 'invoice-a',
  number: 'INV-100',
  customerId: customer.id,
  issuedAt: '2026-07-01',
  dueAt: '2026-08-01',
  amount: 10000000,
  paid: 0,
  status: InvoiceStatus.Open,
  reference: '',
};
const payment: Payment = {
  id: 'payment-a',
  customerId: '',
  amount: 15000000,
  date,
  reference: 'BANK-100',
  bank: 'HBL',
  method: PaymentMethod.BankTransfer,
  description: 'ALI TRADERS',
  allocations: [],
  status: PaymentStatus.Unmatched,
};

function fixture() {
  const workspace = emptyWorkspace('organization-a', 'Atlas');
  workspace.customers.push(customer);
  workspace.invoices.push(invoice, {
    ...invoice,
    id: 'invoice-b',
    number: 'INV-101',
    amount: 8000000,
  });
  workspace.payments.push(payment);

  return structuredClone(workspace);
}

describe('exact money and receivable calculations', () => {
  it('reports unallocated receipt aging and due promise fulfillment', () => {
    const workspace = fixture();
    workspace.payments.push({
      ...payment,
      id: 'payment-b',
      amount: 10_000,
      date: '2026-09-01',
      allocations: [{ invoiceId: invoice.id, amount: 4_000 }],
      status: PaymentStatus.Partial,
    });
    workspace.promises.push(
      {
        id: 'promise-a',
        customerId: customer.id,
        amount: 10_000,
        date: '2026-09-10',
        createdAt: '2026-09-01T00:00:00.000Z',
        status: PromiseStatus.Kept,
        note: '',
        baselineAllocations: [],
      },
      {
        id: 'promise-b',
        customerId: customer.id,
        amount: 10_000,
        date: '2026-09-11',
        createdAt: '2026-09-01T00:00:00.000Z',
        status: PromiseStatus.PartiallyKept,
        note: '',
        baselineAllocations: [],
      },
    );
    expect(operationsMetrics(workspace, date)).toEqual({
      unallocatedReceipts: 2,
      unallocatedAmount: 15_006_000,
      receiptsWaitingSevenDays: 1,
      promisesDue: 2,
      promisesKept: 1,
    });
  });
  it('converts decimal strings without floating-point rounding loss', () => {
    expect(toPaisa('0.29')).toBe(29);
    expect(toPaisa('123456.78')).toBe(12345678);
    expect(toPaisa('1.2')).toBe(120);
  });
  it('rejects fractions below a paisa, negatives, exponent notation, and overflow', () => {
    for (const input of ['0.001', '-1', '1e8', '10000000001', 'abc']) {
      expect(() => toPaisa(input)).toThrow();
    }
  });
  it('assigns exact aging boundaries without counting draft or written-off balances', () => {
    const workspace = fixture();
    workspace.invoices = [0, 1, 30, 31, 60, 61, 90, 91, 120, 121].map((days, index) => ({
      ...invoice,
      id: String(index),
      amount: 100,
      dueAt: offsetDate(date, -days),
    }));
    workspace.invoices.push(
      { ...invoice, status: InvoiceStatus.Draft },
      { ...invoice, status: InvoiceStatus.WrittenOff },
    );
    expect(aging(workspace, date).map((bucket) => bucket.amount)).toEqual([
      100, 200, 200, 200, 200, 100,
    ]);
    expect(metrics(workspace, date).total).toBe(1000);
  });
  it('keeps disputed balances in receivables and excludes them from matching', () => {
    const workspace = fixture();
    workspace.invoices = [{ ...invoice, status: InvoiceStatus.Disputed }];
    expect(account(workspace, customer.id, date).outstanding).toBe(invoice.amount);
    expect(suggestMatch(workspace, payment)).toBeNull();
  });
  it('uses business dates for overdue status and paid status takes precedence', () => {
    expect(invoiceStatus({ ...invoice, dueAt: date }, date)).toBe(InvoiceStatus.Open);
    expect(invoiceStatus({ ...invoice, paid: invoice.amount }, date)).toBe(InvoiceStatus.Paid);
    expect(invoiceStatus(invoice, date)).toBe(InvoiceStatus.Overdue);
  });
  it('handles empty workspaces without NaN', () => {
    expect(metrics(emptyWorkspace('o', 'Org'), date)).toEqual({
      total: 0,
      overdue: 0,
      collected: 0,
      averageDays: 0,
    });
    expect(formatMoney(0)).toBe('Rs 0');
  });
});
describe('ledger mutation and approvals', () => {
  it('allocates a single payment across invoices and leaves a partial invoice balance', () => {
    const workspace = applyCommand(
      fixture(),
      {
        type: CommandType.AllocatePayment,
        paymentId: payment.id,
        customerId: customer.id,
        allocations: [
          { invoiceId: invoice.id, amount: 10000000 },
          { invoiceId: 'invoice-b', amount: 5000000 },
        ],
      },
      Role.Accountant,
      Role.Accountant,
      now,
    );
    expect(workspace.invoices.map(balance)).toEqual([0, 3000000]);
    expect(workspace.payments[0]?.status).toBe(PaymentStatus.Matched);
    expect(workspace.audit[0]?.action).toBe(CommandType.AllocatePayment);
    expect(fixture().invoices[0]?.paid).toBe(0);
  });
  it('supports partial payment allocation and rejects duplicate approvals', () => {
    const command = {
      type: CommandType.AllocatePayment,
      paymentId: payment.id,
      customerId: customer.id,
      allocations: [{ invoiceId: invoice.id, amount: invoice.amount }],
    } satisfies Parameters<typeof applyCommand>[1];
    const workspace = applyCommand(fixture(), command, Role.Accountant, Role.Accountant, now);
    expect(workspace.payments[0]?.status).toBe(PaymentStatus.Partial);
    expect(() => applyCommand(workspace, command, Role.Accountant, Role.Accountant, now)).toThrow();
  });
  it('rejects over-allocation atomically and leaves the original untouched', () => {
    const workspace = fixture();
    const before = structuredClone(workspace);
    expect(() =>
      applyCommand(
        workspace,
        {
          type: CommandType.AllocatePayment,
          paymentId: payment.id,
          customerId: customer.id,
          allocations: [
            { invoiceId: invoice.id, amount: 9999999 },
            { invoiceId: 'invoice-b', amount: 9000000 },
          ],
        },
        Role.Accountant,
        Role.Accountant,
        now,
      ),
    ).toThrow();
    expect(workspace).toEqual(before);
  });
  it('rejects cross-customer invoice allocations', () => {
    const workspace = fixture();
    workspace.customers.push({ ...customer, id: 'customer-b', name: 'Other Traders' });
    expect(() =>
      applyCommand(
        workspace,
        {
          type: CommandType.AllocatePayment,
          paymentId: payment.id,
          customerId: 'customer-b',
          allocations: [{ invoiceId: invoice.id, amount: 10 }],
        },
        Role.Accountant,
        Role.Accountant,
        now,
      ),
    ).toThrow('belonging');
  });
  it('reverses allocations, retains the evidence, and prevents double reversal', () => {
    const allocated = applyCommand(
      fixture(),
      {
        type: CommandType.AllocatePayment,
        paymentId: payment.id,
        customerId: customer.id,
        allocations: [{ invoiceId: invoice.id, amount: invoice.amount }],
      },
      Role.Accountant,
      Role.Accountant,
      now,
    );
    const reverse = {
      type: CommandType.ReversePayment,
      paymentId: payment.id,
      reason: 'Incorrect remittance reference',
    } satisfies Parameters<typeof applyCommand>[1];
    const reversed = applyCommand(allocated, reverse, Role.Accountant, Role.Accountant, now);
    expect(reversed.invoices[0]?.paid).toBe(0);
    expect(reversed.payments[0]?.allocations).toHaveLength(1);
    expect(reversed.payments[0]?.status).toBe(PaymentStatus.Reversed);
    expect(() => applyCommand(reversed, reverse, Role.Accountant, Role.Accountant, now)).toThrow();
  });
  it('enforces role permissions for financial actions', () => {
    expect(() =>
      applyCommand(
        fixture(),
        {
          type: CommandType.UpdateCredit,
          customerId: customer.id,
          limit: 99999999,
          reason: 'Approved after review',
        },
        'Collector',
        Role.Collections,
        now,
      ),
    ).toThrow('role');
    expect(() =>
      applyCommand(
        fixture(),
        { type: CommandType.QueueReminder, customerId: customer.id },
        Role.Viewer,
        Role.Viewer,
        now,
      ),
    ).toThrow('role');
  });
  it('suggests multi-invoice allocation without mutating the ledger', () => {
    const workspace = fixture();
    const before = structuredClone(workspace);
    const match = suggestMatch(workspace, payment);
    expect(match?.allocations).toEqual([
      { invoiceId: invoice.id, amount: invoice.amount },
      { invoiceId: 'invoice-b', amount: 5000000 },
    ]);
    expect(workspace).toEqual(before);
  });
  it('deduplicates bank imports by bank and reference', () => {
    const { id: paymentId, allocations, status, ...input } = payment;
    expect(paymentId && allocations && status).toBeTruthy();
    expect(() =>
      applyCommand(
        fixture(),
        { type: CommandType.ImportPayments, payments: [input] },
        Role.Accountant,
        Role.Accountant,
        now,
      ),
    ).toThrow('already exists');
  });
  it('rejects negative and fractional paisa at the API contract', () => {
    expect(
      commandSchema.safeParse({
        type: CommandType.AllocatePayment,
        paymentId: payment.id,
        customerId: customer.id,
        allocations: [{ invoiceId: invoice.id, amount: -1 }],
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: CommandType.UpdateCredit,
        customerId: customer.id,
        limit: 1.5,
        reason: 'Invalid amount',
      }).success,
    ).toBe(false);
  });
});
describe('collections and promises', () => {
  it('deduplicates reminders and enforces the daily cap', () => {
    const queued = applyCommand(
      fixture(),
      { type: CommandType.QueueReminder, customerId: customer.id },
      'Collector',
      Role.Collections,
      now,
    );
    expect(queued.jobs).toHaveLength(1);
    expect(() =>
      applyCommand(
        queued,
        { type: CommandType.QueueReminder, customerId: customer.id },
        'Collector',
        Role.Collections,
        now,
      ),
    ).toThrow('already exists');
  });
  it('prevents reminders for held accounts', () => {
    const workspace = fixture();
    const item = workspace.customers[0];
    if (item) {
      item.status = CustomerStatus.OnHold;
    }
    expect(() =>
      applyCommand(
        workspace,
        { type: CommandType.QueueReminder, customerId: customer.id },
        'Collector',
        Role.Collections,
        now,
      ),
    ).toThrow('paused');
  });
  it('rejects overlapping active promises and marks a promise kept after allocation', () => {
    const promise = {
      type: CommandType.CreatePromise,
      customerId: customer.id,
      amount: invoice.amount,
      date: offsetDate(date, 1),
      note: 'Confirmed by customer',
    } satisfies Parameters<typeof applyCommand>[1];
    const workspace = applyCommand(fixture(), promise, 'Collector', Role.Collections, now);
    expect(() => applyCommand(workspace, promise, 'Collector', Role.Collections, now)).toThrow(
      'existing active',
    );
    const result = applyCommand(
      workspace,
      {
        type: CommandType.AllocatePayment,
        paymentId: payment.id,
        customerId: customer.id,
        allocations: [{ invoiceId: invoice.id, amount: invoice.amount }],
      },
      Role.Accountant,
      Role.Accountant,
      now,
    );
    expect(result.promises[0]?.status).toBe(PromiseStatus.Kept);
  });
  it('extracts Roman Urdu amounts and resolves the next named weekday', () => {
    const result = analyzeReply('Monday ko 2 lakh transfer kar doon ga.', date);
    expect(result.category).toBe(ReplyCategory.PromiseToPay);
    expect(result.amount).toBe(20000000);
    expect(result.date).toBe('2026-09-14');
  });

  it('prefers an explicit promise date over a weekday and reads the amount unit', () => {
    const result = analyzeReply('Will pay by Monday 2026-09-17 Rs 1.5 lakh', date);

    expect(result.category).toBe(ReplyCategory.PromiseToPay);
    expect(result.amount).toBe(15_000_000);
    expect(result.date).toBe('2026-09-17');
  });
});
describe('CSV safety and imports', () => {
  it('parses quoted commas, escaped quotes, newlines, and a BOM', () => {
    expect(parseCsv('\uFEFFname,note\r\n"Ali, Traders","said ""paid""\nthanks"')).toEqual([
      { name: 'Ali, Traders', note: 'said "paid"\nthanks' },
    ]);
  });
  it('rejects malformed column counts and quotes', () => {
    expect(() => parseCsv('a,b\n1,2,3')).toThrow('columns');
    expect(() => parseCsv('a,b\n"unclosed,2')).toThrow('quote');
  });
  it('escapes spreadsheet formulas in exports', () => {
    expect(csvExport(['Name'], [['=SUM(A1)']])).toContain("'=SUM(A1)");
  });
  it('maps imported invoice names to tenant customer IDs and rejects missing accounts', () => {
    const command = importCommand(
      ImportKind.Invoices,
      `number,customer,issued_at,due_at,amount\nINV-NEW,Ali Traders,${date},${offsetDate(date, 30)},0.29`,
      fixture(),
    );
    expect(command.type).toBe(CommandType.ImportInvoices);
    if (command.type === CommandType.ImportInvoices) {
      expect(command.invoices[0]?.amount).toBe(29);
    }
    expect(() =>
      importCommand(
        ImportKind.Invoices,
        `number,customer,issued_at,due_at,amount\nINV-NEW,Missing,${date},${date},100`,
        fixture(),
      ),
    ).toThrow('not found');
  });
});
