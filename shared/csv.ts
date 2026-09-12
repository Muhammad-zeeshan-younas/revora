import { CommandType, CustomerStatus, ImportKind, InvoiceStatus, PaymentMethod } from './enums';
import { commandSchema } from './schema';
import type { Command, Workspace } from './schema';
import { toPaisa } from './finance';

export { ImportKind } from './enums';
export function parseCsv(source: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = source.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = !quoted;
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
  const headers = rows.shift()?.map((header) => header.toLowerCase());
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
export function importCommand(kind: ImportKind, source: string, workspace: Workspace): Command {
  const rows = parseCsv(source);

  function customerId(value: string): string {
    const customer = workspace.customers.find(
      (item) => item.name.toLowerCase() === value.toLowerCase() || item.id === value,
    );
    if (!customer) {
      throw new Error(`Customer "${value}" was not found. Import customers first.`);
    }

    return customer.id;
  }
  if (kind === ImportKind.Customers) {
    return commandSchema.parse({
      type: CommandType.ImportCustomers,
      customers: rows.map((row) => ({
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
      })),
    });
  }
  if (kind === ImportKind.Invoices) {
    return commandSchema.parse({
      type: CommandType.ImportInvoices,
      invoices: rows.map((row) => ({
        number: row['number'],
        customerId: customerId(row['customer'] ?? ''),
        issuedAt: row['issued_at'],
        dueAt: row['due_at'],
        amount: toPaisa(row['amount'] ?? ''),
        status: InvoiceStatus.Open,
        reference: row['reference'] ?? '',
      })),
    });
  }

  return commandSchema.parse({
    type: CommandType.ImportPayments,
    payments: rows
      .filter((row) => !row['debit'] || Number(row['debit']) === 0)
      .map((row) => ({
        customerId: row['customer'] ? customerId(row['customer']) : '',
        date: row['date'],
        amount: toPaisa(row['credit'] ?? row['amount'] ?? ''),
        reference: row['reference'],
        description: row['description'] ?? '',
        bank: row['bank'] || 'Imported bank',
        method: PaymentMethod.BankTransfer,
      })),
  });
}
export function csvExport(headers: string[], rows: string[][]): string {
  const escape = (value: string): string =>
    `"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;

  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
}
