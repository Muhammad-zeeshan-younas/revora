import { FINANCE } from './constants';
import { InvoiceAdjustmentDirection, InvoiceStatus, PaymentStatus, WriteOffStatus } from './enums';
import { offsetDate, today } from './finance';
import type { Invoice, Workspace } from './schema';

export interface CustomerReportRow {
  customerId: string;
  customerName: string;
  opening: number;
  sales: number;
  collected: number;
  closing: number;
  overdue: number;
}

export interface ManagementReport {
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  opening: number;
  creditSales: number;
  collected: number;
  closing: number;
  currentClosing: number;
  dsoDays: number | null;
  collectionEffectivenessPercent: number | null;
  customers: CustomerReportRow[];
}

/** DSO uses period-end AR / period credit sales * calendar days. CEI excludes not-yet-due closing AR from its denominator. */
export function managementReport(
  workspace: Workspace,
  month: string,
  now = new Date(),
): ManagementReport {
  const periodStart = `${month}-01`;
  const nextMonth = new Date(`${periodStart}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const periodEnd = [offsetDate(nextMonth.toISOString().slice(0, 10), -1), today(now)].sort()[0]!;
  const openingDate = offsetDate(periodStart, -1);
  const days =
    Math.round((Date.parse(periodEnd) - Date.parse(periodStart)) / FINANCE.millisecondsPerDay) + 1;
  const openingPaid = new Map<string, number>();
  const closingPaid = new Map<string, number>();
  const paymentsByInvoice = new Map<string, number>();
  for (const payment of workspace.payments) {
    if (payment.date > periodEnd || payment.status === PaymentStatus.Reversed) {continue;}
    for (const allocation of payment.allocations) {
      const invoiceId = allocation.invoiceId;
      closingPaid.set(invoiceId, (closingPaid.get(invoiceId) ?? 0) + allocation.amount);
      if (payment.date < periodStart) {
        openingPaid.set(invoiceId, (openingPaid.get(invoiceId) ?? 0) + allocation.amount);
      } else {
        paymentsByInvoice.set(
          invoiceId,
          (paymentsByInvoice.get(invoiceId) ?? 0) + allocation.amount,
        );
      }
    }
  }
  const openingAdjustments = new Map<string, number>();
  const closingAdjustments = new Map<string, number>();
  for (const correction of workspace.invoiceCorrections) {
    const adjustment =
      correction.direction === InvoiceAdjustmentDirection.Increase
        ? correction.amount
        : -correction.amount;
    if (correction.createdAt.slice(0, 10) > openingDate)
      {openingAdjustments.set(
        correction.invoiceId,
        (openingAdjustments.get(correction.invoiceId) ?? 0) + adjustment,
      );}
    if (correction.createdAt.slice(0, 10) > periodEnd)
      {closingAdjustments.set(
        correction.invoiceId,
        (closingAdjustments.get(correction.invoiceId) ?? 0) + adjustment,
      );}
  }
  const writeOffDates = new Map(
    workspace.writeOffRequests
      .filter((request) => request.status === WriteOffStatus.Approved)
      .map((request) => [request.invoiceId, request.reviewedAt.slice(0, 10)]),
  );
  const invoicesByCustomer = new Map<string, Invoice[]>();
  for (const invoice of workspace.invoices) {
    const group = invoicesByCustomer.get(invoice.customerId) ?? [];
    group.push(invoice);
    invoicesByCustomer.set(invoice.customerId, group);
  }
  const amountAt = (invoice: Invoice, opening: boolean): number =>
    invoice.amount - ((opening ? openingAdjustments : closingAdjustments).get(invoice.id) ?? 0);
  const balanceAt = (invoice: Invoice, opening: boolean): number => {
    const date = opening ? openingDate : periodEnd;
    if (
      invoice.issuedAt > date ||
      invoice.status === InvoiceStatus.Draft ||
      (writeOffDates.get(invoice.id) ?? '9999-12-31') <= date
    )
      {return 0;}

    return Math.max(
      0,
      amountAt(invoice, opening) - ((opening ? openingPaid : closingPaid).get(invoice.id) ?? 0),
    );
  };
  const rows = workspace.customers.map((customer) => {
    const invoices = invoicesByCustomer.get(customer.id) ?? [];
    const opening = invoices.reduce((sum, invoice) => sum + balanceAt(invoice, true), 0);
    const sales = invoices
      .filter(
        (invoice) =>
          invoice.issuedAt >= periodStart &&
          invoice.issuedAt <= periodEnd &&
          invoice.status !== InvoiceStatus.Draft,
      )
      .reduce((sum, invoice) => sum + amountAt(invoice, false), 0);
    const collected = invoices.reduce(
      (sum, invoice) => sum + (paymentsByInvoice.get(invoice.id) ?? 0),
      0,
    );
    const closing = invoices.reduce((sum, invoice) => sum + balanceAt(invoice, false), 0);
    const overdue = invoices
      .filter((invoice) => invoice.dueAt < periodEnd)
      .reduce((sum, invoice) => sum + balanceAt(invoice, false), 0);

    return {
      customerId: customer.id,
      customerName: customer.name,
      opening,
      sales,
      collected,
      closing,
      overdue,
    };
  });
  const opening = rows.reduce((sum, row) => sum + row.opening, 0);
  const creditSales = rows.reduce((sum, row) => sum + row.sales, 0);
  const collected = rows.reduce((sum, row) => sum + row.collected, 0);
  const closing = rows.reduce((sum, row) => sum + row.closing, 0);
  const currentClosing = workspace.invoices
    .filter((invoice) => invoice.dueAt >= periodEnd)
    .reduce((sum, invoice) => sum + balanceAt(invoice, false), 0);
  const collectible = opening + creditSales - currentClosing;

  return {
    periodStart,
    periodEnd,
    generatedAt: now.toISOString(),
    opening,
    creditSales,
    collected,
    closing,
    currentClosing,
    dsoDays: creditSales > 0 ? Math.round((closing / creditSales) * days * 10) / 10 : null,
    collectionEffectivenessPercent:
      collectible > 0
        ? Math.round(((opening + creditSales - closing) / collectible) * 1000) / 10
        : null,
    customers: rows
      .filter((row) => row.opening || row.sales || row.collected || row.closing)
      .sort((a, b) => b.closing - a.closing),
  };
}
