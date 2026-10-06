import { z } from 'zod';
import { COLLECTIONS } from './constants';
import {
  BankDateFormat,
  CommandType,
  CustomerStatus,
  ImportKind,
  ImportReviewStatus,
  InvoiceStatus,
  PaymentMethod,
} from './enums';
import {
  commandSchema,
  customerInputSchema,
  invoiceInputSchema,
  paymentInputSchema,
  bankStatementEntrySchema,
} from './schema';
import type { BankStatementEntry, Command, Workspace } from './schema';
import { toPaisa, today } from './finance';
import { paymentReferenceKey } from './payment-reference';

const CSV_BOM_PATTERN = /^\uFEFF/;
const CSV_HEADER_SEPARATOR_PATTERN = /[\s-]+/g;
const BANK_DAY_MONTH_YEAR_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const SPREADSHEET_FORMULA_PREFIX_PATTERN = /^[=+@\-\t\r]/;
const BANK_COLUMN_ALIASES: Record<BankField, string[]> = {
  date: ['date', 'transaction_date', 'value_date'],
  reference: ['reference', 'transaction_reference', 'transaction_id', 'ref_no'],
  credit: ['credit', 'deposit', 'deposits'],
  debit: ['debit', 'withdrawal', 'withdrawals'],
  amount: ['amount', 'transaction_amount'],
  description: ['description', 'narration', 'details'],
  bank: ['bank', 'bank_name'],
  customer: ['customer', 'customer_name'],
};

export { ImportKind } from './enums';
export type BankField =
  'date' | 'reference' | 'description' | 'bank' | 'customer' | 'credit' | 'debit' | 'amount';
export interface BankImportOptions {
  columns?: Partial<Record<BankField, string>>;
  dateFormat?: BankDateFormat;
}

export const bankImportProfileSchema = z.object({
  name: z.string().trim().min(2).max(60),
  columns: z.object({
    date: z.string().max(100),
    reference: z.string().max(100),
    credit: z.string().max(100),
    debit: z.string().max(100),
    amount: z.string().max(100),
    description: z.string().max(100),
    bank: z.string().max(100),
    customer: z.string().max(100),
  }),
  dateFormat: z.enum(BankDateFormat),
});

export const bankImportProfilesSchema = z.array(bankImportProfileSchema);
export type BankImportProfile = z.infer<typeof bankImportProfileSchema>;

export interface ImportReviewRow {
  rowNumber: number;
  status: ImportReviewStatus;
  summary: string;
  issue: string;
}
export interface ImportReview {
  headers: string[];
  rows: ImportReviewRow[];
  command: Command | null;
  readyCount: number;
  skippedCount: number;
  errorCount: number;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().trim().replaceAll(CSV_HEADER_SEPARATOR_PATTERN, '_');
}

function bankField(
  row: Record<string, string>,
  field: BankField,
  options: BankImportOptions,
): string {
  const selected = options.columns?.[field];
  if (selected) {
    const header = normalizeHeader(selected);

    if (row[header] === undefined) {
      throw new Error(`Mapped ${field} column "${selected}" was not found.`);
    }

    return row[header];
  }

  const found = BANK_COLUMN_ALIASES[field].filter((alias) => row[alias] !== undefined);
  if (found.length > 1) {
    throw new Error(
      `Use only one column for ${BANK_COLUMN_ALIASES[field][0]}: ${found.join(', ')}.`,
    );
  }

  return found.length ? (row[found[0]!] ?? '') : '';
}

function customerIndex(workspace: Workspace): Map<string, string> {
  const customers = new Map<string, string>();

  for (const customer of workspace.customers) {
    customers.set(customer.name.toLowerCase(), customer.id);
    customers.set(customer.id, customer.id);
  }

  return customers;
}

function resolveCustomerId(customers: Map<string, string>, value: string): string {
  const id = customers.get(value.toLowerCase());

  if (!id) {
    throw new Error(`Customer "${value}" was not found. Import customers first.`);
  }

  return id;
}

function formatImportIssue(error: Error): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  }

  return error.message;
}

function parseCustomerRow(row: Record<string, string>) {
  return customerInputSchema.parse({
    name: row['name'],
    contact: row['contact'],
    email: row['email'],
    phone: row['phone'],
    city: row['city'],
    taxId: row['tax_id'] ?? '',
    salesperson: row['salesperson'] || 'Unassigned',
    creditLimit: toPaisa(row['credit_limit'] || '0'),
    terms: Number(row['terms'] || '30'),
    status: CustomerStatus.Active,
  });
}

function parseInvoiceRow(row: Record<string, string>, customers: Map<string, string>) {
  return invoiceInputSchema.parse({
    number: row['number'],
    customerId: resolveCustomerId(customers, row['customer'] ?? ''),
    issuedAt: row['issued_at'],
    dueAt: row['due_at'],
    amount: toPaisa(row['amount'] ?? ''),
    status: InvoiceStatus.Open,
    reference: row['reference'] ?? '',
  });
}

function parsePaymentRow(
  row: Record<string, string>,
  rowNumber: number,
  customers: Map<string, string>,
  options: BankImportOptions,
) {
  const debit = bankField(row, 'debit', options);
  const credit = bankField(row, 'credit', options);
  const amount = bankField(row, 'amount', options);
  let debitPaisa = 0;

  try {
    debitPaisa = debit ? toPaisa(debit) : 0;
  } catch {
    throw new Error(`Row ${rowNumber} has an invalid debit amount.`);
  }

  if (debitPaisa > 0) {
    if (credit && toPaisa(credit) > 0) {
      throw new Error(`Row ${rowNumber} contains both a debit and a credit.`);
    }

    return null;
  }

  const date = parseBankDate(bankField(row, 'date', options), rowNumber, options.dateFormat);

  const customer = bankField(row, 'customer', options);

  return paymentInputSchema.parse({
    customerId: customer ? resolveCustomerId(customers, customer) : '',
    date,
    amount: toPaisa(credit || amount),
    reference: bankField(row, 'reference', options),
    description: bankField(row, 'description', options),
    bank: bankField(row, 'bank', options) || 'Imported bank',
    method: PaymentMethod.BankTransfer,
  });
}

function parseBankDate(sourceDate: string, rowNumber: number, format = BankDateFormat.Iso): string {
  if (format === BankDateFormat.Iso) {
    return sourceDate;
  }

  const match = BANK_DAY_MONTH_YEAR_PATTERN.exec(sourceDate);
  if (!match) {
    throw new Error(`Row ${rowNumber} date must use DD/MM/YYYY.`);
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function parseBankStatementRows(
  source: string,
  bank: string,
  options: BankImportOptions = {},
): BankStatementEntry[] {
  const rows = parseCsv(source);
  if (rows.length === 0 || rows.length > COLLECTIONS.maximumBatchRows) {
    throw new Error('Statement must contain between 1 and 1,000 data rows.');
  }

  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const debitText = bankField(row, 'debit', options);
    const directCredit = bankField(row, 'credit', options);
    const creditText = directCredit || (debitText ? '' : bankField(row, 'amount', options));

    return bankStatementEntrySchema.parse({
      rowNumber,
      date: parseBankDate(bankField(row, 'date', options), rowNumber, options.dateFormat),
      reference: bankField(row, 'reference', options),
      bank: bankField(row, 'bank', options) || bank,
      credit: creditText ? toPaisa(creditText) : 0,
      debit: debitText ? toPaisa(debitText) : 0,
    });
  });
}

export function parseCsv(source: string): Record<string, string>[] {
  if (
    source.length > COLLECTIONS.maximumCsvBytes ||
    new TextEncoder().encode(source).byteLength > COLLECTIONS.maximumCsvBytes
  ) {
    throw new Error('CSV is larger than the 1.5 MB upload limit.');
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = source.replace(CSV_BOM_PATTERN, '');

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (quoted) {
        quoted = false;
        const next = input[index + 1];
        if (next && ![',', '\r', '\n'].includes(next)) {
          throw new Error('CSV has text after a closing quote.');
        }
      } else {
        if (field !== '') {
          throw new Error('CSV has a quote inside an unquoted field.');
        }
        quoted = true;
      }
    } else if (char === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') {
        index++;
      }
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new Error('CSV contains an unclosed quote.');
  }

  row.push(field.trim());
  if (row.some((cell) => cell !== '')) {
    rows.push(row);
  }

  const headers = rows.shift()?.map(normalizeHeader);
  if (!headers || headers.length === 0 || new Set(headers).size !== headers.length) {
    throw new Error('CSV requires unique column headers.');
  }

  return rows.map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new Error(`Row ${index + 2} has ${cells.length} columns; expected ${headers.length}.`);
    }

    return Object.fromEntries(headers.map((header, column) => [header, cells[column] ?? '']));
  });
}

export function importCommand(
  kind: ImportKind,
  source: string,
  workspace: Workspace,
  bankOptions: BankImportOptions = {},
): Command {
  const rows = parseCsv(source);
  const customers = customerIndex(workspace);

  if (kind === ImportKind.Customers) {
    return commandSchema.parse({
      type: CommandType.ImportCustomers,
      customers: rows.map(parseCustomerRow),
    });
  }

  if (kind === ImportKind.Invoices) {
    return commandSchema.parse({
      type: CommandType.ImportInvoices,
      invoices: rows.map((row) => parseInvoiceRow(row, customers)),
    });
  }

  const payments = rows.flatMap((row, index) => {
    const payment = parsePaymentRow(row, index + 2, customers, bankOptions);

    return payment ? [payment] : [];
  });

  return commandSchema.parse({
    type: CommandType.ImportPayments,
    payments,
  });
}

export function inspectImport(
  kind: ImportKind,
  source: string,
  workspace: Workspace,
  options: BankImportOptions = {},
): ImportReview {
  const sourceRows = parseCsv(source);
  if (sourceRows.length === 0 || sourceRows.length > COLLECTIONS.maximumBatchRows) {
    throw new Error('CSV must contain between 1 and 1,000 data rows.');
  }

  const headers = Object.keys(sourceRows[0] ?? {});
  const rows: ImportReviewRow[] = [];
  const customers = [] as Extract<Command, { type: CommandType.ImportCustomers }>['customers'];
  const invoices = [] as Extract<Command, { type: CommandType.ImportInvoices }>['invoices'];
  const payments = [] as Extract<Command, { type: CommandType.ImportPayments }>['payments'];
  const customerIds = customerIndex(workspace);
  const customerNames = new Set(workspace.customers.map((item) => item.name.toLowerCase()));
  const invoiceNumbers = new Set(workspace.invoices.map((item) => item.number.toLowerCase()));
  const paymentRefs = new Set(
    workspace.payments.map((item) => paymentReferenceKey(item.bank, item.reference)),
  );

  for (const [index, row] of sourceRows.entries()) {
    const rowNumber = index + 2;
    let summary = row['name'] || row['number'] || `Row ${rowNumber}`;

    try {
      if (kind === ImportKind.Customers) {
        const item = parseCustomerRow(row);
        const key = item.name.toLowerCase();

        if (customerNames.has(key)) {
          throw new Error('Customer name already exists in this workspace or file.');
        }

        customerNames.add(key);
        customers.push(item);
      } else if (kind === ImportKind.Invoices) {
        const item = parseInvoiceRow(row, customerIds);

        if (item.issuedAt > today()) {
          throw new Error('Invoice date cannot be in the future.');
        }

        const key = item.number.toLowerCase();

        if (invoiceNumbers.has(key)) {
          throw new Error('Invoice number already exists in this workspace or file.');
        }

        invoiceNumbers.add(key);
        invoices.push(item);
      } else {
        summary = bankField(row, 'reference', options) || summary;
        const item = parsePaymentRow(row, rowNumber, customerIds, options);

        if (!item) {
          rows.push({
            rowNumber,
            status: ImportReviewStatus.Skipped,
            summary,
            issue: 'Outgoing debit',
          });

          continue;
        }

        if (item.date > today()) {
          throw new Error('Payment date cannot be in the future.');
        }

        const key = paymentReferenceKey(item.bank, item.reference);

        if (paymentRefs.has(key)) {
          throw new Error('Bank reference already exists in this workspace or file.');
        }

        paymentRefs.add(key);
        payments.push(item);
      }

      rows.push({ rowNumber, status: ImportReviewStatus.Ready, summary, issue: '' });
    } catch (error) {
      rows.push({
        rowNumber,
        status: ImportReviewStatus.Error,
        summary,
        issue: formatImportIssue(error instanceof Error ? error : new Error('Invalid row')),
      });
    }
  }

  const errorCount = rows.filter((row) => row.status === ImportReviewStatus.Error).length;
  const readyCount = rows.filter((row) => row.status === ImportReviewStatus.Ready).length;
  const skippedCount = rows.length - readyCount - errorCount;
  let command: Command | null = null;

  if (errorCount === 0 && readyCount > 0) {
    if (kind === ImportKind.Customers) {
      command = commandSchema.parse({ type: CommandType.ImportCustomers, customers });
    } else if (kind === ImportKind.Invoices) {
      command = commandSchema.parse({ type: CommandType.ImportInvoices, invoices });
    } else {
      command = commandSchema.parse({ type: CommandType.ImportPayments, payments });
    }
  }

  return { headers, rows, command, readyCount, skippedCount, errorCount };
}

export function csvExport(headers: string[], rows: string[][]): string {
  const escape = (value: string): string =>
    `"${(SPREADSHEET_FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;

  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
}
