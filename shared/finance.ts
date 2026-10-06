import { CollectionPriority, InvoiceStatus, PaymentStatus, PromiseStatus } from './enums';
import type { Customer, Invoice, Payment, PromiseToPay, Workspace } from './schema';
import type {
  AccountSummary,
  AgingBucket,
  OperationsMetrics,
  ReceivablesMetrics,
} from './finance.types';
import { FINANCE } from './constants';
import { groupBy } from './collections';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FINANCE.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const moneyFormatter = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });
const POSITIVE_RUPEE_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const CUSTOMER_NAME_WORD_SEPARATOR_PATTERN = /\s+/;

export function today(now = new Date()): string {
  return dateFormatter.format(now);
}

export function offsetDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * FINANCE.millisecondsPerDay)
    .toISOString()
    .slice(0, 10);
}

export function overdueDays(invoice: Pick<Invoice, 'dueAt'>, date = today()): number {
  return Math.max(
    0,
    Math.floor(
      (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${invoice.dueAt}T00:00:00Z`)) /
        FINANCE.millisecondsPerDay,
    ),
  );
}

export function balance(invoice: Invoice): number {
  return invoice.status === InvoiceStatus.Draft || invoice.status === InvoiceStatus.WrittenOff
    ? 0
    : invoice.amount - invoice.paid;
}

export function invoiceStatus(invoice: Invoice, date = today()): InvoiceStatus {
  if (invoice.status !== InvoiceStatus.Open) {
    return invoice.status;
  }
  if (invoice.paid === invoice.amount) {
    return InvoiceStatus.Paid;
  }
  if (overdueDays(invoice, date) > 0) {
    return InvoiceStatus.Overdue;
  }

  return invoice.paid > 0 ? InvoiceStatus.PartiallyPaid : InvoiceStatus.Open;
}

export function account(workspace: Workspace, customerId: string, date = today()): AccountSummary {
  return summarizeAccount(
    workspace.customers.find((customer) => customer.id === customerId),
    workspace.invoices.filter((invoice) => invoice.customerId === customerId),
    workspace.promises.filter((promise) => promise.customerId === customerId),
    date,
  );
}

/** Compute the customer list in linear passes over invoices and promises. */
export function customerAccounts(
  workspace: Workspace,
  date = today(),
): (Customer & AccountSummary)[] {
  const invoicesByCustomer = groupBy(workspace.invoices, (invoice) => invoice.customerId);
  const promisesByCustomer = groupBy(workspace.promises, (promise) => promise.customerId);

  return workspace.customers.map((customer) => ({
    ...customer,
    ...summarizeAccount(
      customer,
      invoicesByCustomer.get(customer.id) ?? [],
      promisesByCustomer.get(customer.id) ?? [],
      date,
    ),
  }));
}

function summarizeAccount(
  customer: Customer | undefined,
  invoices: readonly Invoice[],
  promises: readonly PromiseToPay[],
  date: string,
): AccountSummary {
  let outstanding = 0;
  let overdue = 0;
  let days = 0;
  for (const invoice of invoices) {
    const remaining = balance(invoice);
    const age = overdueDays(invoice, date);
    outstanding += remaining;
    if (age > 0) {
      overdue += remaining;
    }
    if (remaining > 0) {
      days = Math.max(days, age);
    }
  }
  const broken = promises.filter((promise) => promise.status === PromiseStatus.Broken).length;
  const limit = customer?.creditLimit ?? 0;
  const utilization = limit > 0 ? (outstanding / limit) * 100 : outstanding > 0 ? 100 : 0;
  const score = Math.min(
    100,
    Math.round(days * 0.7 + overdue / 5_000_000 + broken * 15 + (utilization > 90 ? 15 : 0)),
  );
  const priority =
    score >= 65
      ? CollectionPriority.Critical
      : score >= 35
        ? CollectionPriority.High
        : CollectionPriority.Normal;

  return {
    outstanding,
    overdue,
    days,
    broken,
    utilization,
    available: limit - outstanding,
    score,
    priority,
  };
}

export function aging(workspace: Workspace, date = today()): AgingBucket[] {
  const buckets = [
    { label: 'Current', amount: 0, color: '#315ee7' },
    { label: '1–30 days', amount: 0, color: '#7399f0' },
    { label: '31–60 days', amount: 0, color: '#a8bde6' },
    { label: '61–90 days', amount: 0, color: '#e2b66d' },
    { label: '91–120 days', amount: 0, color: '#d98064' },
    { label: '120+ days', amount: 0, color: '#b43c4b' },
  ];
  for (const invoice of workspace.invoices) {
    const days = overdueDays(invoice, date);
    const index =
      days === 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : days <= 120 ? 4 : 5;
    const bucket = buckets[index];
    if (bucket) {
      bucket.amount += balance(invoice);
    }
  }

  return buckets;
}

export function metrics(workspace: Workspace, date = today()): ReceivablesMetrics {
  const total = workspace.invoices.reduce((sum, invoice) => sum + balance(invoice), 0);
  const overdue = workspace.invoices.reduce(
    (sum, invoice) => sum + (overdueDays(invoice, date) > 0 ? balance(invoice) : 0),
    0,
  );
  const collected = workspace.payments
    .filter(
      (payment) =>
        payment.date.startsWith(date.slice(0, 7)) && payment.status !== PaymentStatus.Reversed,
    )
    .reduce(
      (sum, payment) =>
        sum + payment.allocations.reduce((value, allocation) => value + allocation.amount, 0),
      0,
    );
  const weightedDays = workspace.invoices.reduce(
    (sum, invoice) =>
      sum +
      balance(invoice) *
        Math.max(0, (Date.parse(date) - Date.parse(invoice.issuedAt)) / FINANCE.millisecondsPerDay),
    0,
  );

  return {
    total,
    overdue,
    collected,
    averageDays: total > 0 ? Math.round(weightedDays / total) : 0,
  };
}

export function operationsMetrics(workspace: Workspace, date = today()): OperationsMetrics {
  const result: OperationsMetrics = {
    unallocatedReceipts: 0,
    unallocatedAmount: 0,
    receiptsWaitingSevenDays: 0,
    promisesDue: 0,
    promisesKept: 0,
  };
  const oldDate = offsetDate(date, -7);
  for (const payment of workspace.payments) {
    if (payment.status === PaymentStatus.Reversed) {
      continue;
    }
    const remaining =
      payment.amount - payment.allocations.reduce((sum, item) => sum + item.amount, 0);
    if (remaining <= 0) {
      continue;
    }
    result.unallocatedReceipts++;
    result.unallocatedAmount += remaining;
    if (payment.date <= oldDate) {
      result.receiptsWaitingSevenDays++;
    }
  }
  for (const promise of workspace.promises) {
    if (promise.status === PromiseStatus.Cancelled || promise.date > date) {
      continue;
    }
    result.promisesDue++;
    if (promise.status === PromiseStatus.Kept) {
      result.promisesKept++;
    }
  }

  return result;
}

export function formatMoney(paisa: number, compact = false): string {
  const rupees = paisa / FINANCE.paisaPerRupee;
  if (compact && Math.abs(rupees) >= 1_000_000) {
    return `Rs ${(rupees / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(rupees) >= 10_000) {
    return `Rs ${(rupees / 1000).toFixed(0)}K`;
  }

  return `Rs ${moneyFormatter.format(rupees)}`;
}

export function toPaisa(value: string): number {
  if (!POSITIVE_RUPEE_AMOUNT_PATTERN.test(value.trim())) {
    throw new Error('Enter a positive amount with at most two decimal places.');
  }
  const [whole = '0', fraction = ''] = value.trim().split('.');
  const result = Number(whole) * FINANCE.paisaPerRupee + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > FINANCE.maximumAmount) {
    throw new Error('Amount is too large.');
  }

  return result;
}

export interface MatchSuggestion {
  customer: Customer;
  allocations: { invoiceId: string; amount: number }[];
  confidence: number;
  reason: string;
}

export function suggestMatch(workspace: Workspace, payment: Payment): MatchSuggestion | null {
  const remaining =
    payment.amount - payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (remaining <= 0 || payment.status === PaymentStatus.Reversed) {
    return null;
  }
  const reference = `${payment.reference} ${payment.description}`.toLowerCase();
  const candidates = workspace.customers
    .filter((customer) => !payment.customerId || customer.id === payment.customerId)
    .map((customer) => {
      const invoices = workspace.invoices
        .filter(
          (invoice) =>
            invoice.customerId === customer.id &&
            invoice.status === InvoiceStatus.Open &&
            balance(invoice) > 0,
        )
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
      const invoiceMatch = invoices.some((invoice) =>
        reference.includes(invoice.number.toLowerCase()),
      );
      const nameMatch = customer.name
        .toLowerCase()
        .split(CUSTOMER_NAME_WORD_SEPARATOR_PATTERN)
        .filter((word) => word.length > 3)
        .some((word) => reference.includes(word));
      const knownCustomer = customer.id === payment.customerId;
      const exact = invoices.find((invoice) => balance(invoice) === remaining);
      const score =
        (knownCustomer ? 60 : 0) +
        (invoiceMatch ? 55 : 0) +
        (nameMatch ? 35 : 0) +
        (exact ? 20 : 0);

      return { customer, invoices, exact, score, invoiceMatch, nameMatch, knownCustomer };
    })
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 35 || best.invoices.length === 0) {
    return null;
  }
  let amount = remaining;
  const allocations: MatchSuggestion['allocations'] = [];
  for (const invoice of best.exact ? [best.exact] : best.invoices) {
    const allocated = Math.min(amount, balance(invoice));
    if (allocated > 0) {
      allocations.push({ invoiceId: invoice.id, amount: allocated });
    }
    amount -= allocated;
  }

  return {
    customer: best.customer,
    allocations,
    confidence: Math.min(98, best.score + (amount === 0 ? 15 : 0)),
    reason: `${best.knownCustomer ? 'Known customer' : best.invoiceMatch ? 'Invoice reference' : 'Customer name'} matches. ${best.exact ? 'Exact invoice amount.' : 'Oldest open invoices first.'} Review before allocating.`,
  };
}
