import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../server/app.module';
import { ApiExceptionFilter } from '../server/filters/api-exception.filter';
import { AccountsService } from '../server/services/accounts.service';
import { WorkspaceRepository } from '../server/repositories/workspace.repository';
import { ImportKind, importCommand, inspectImport, parseCsv } from '../shared/csv';
import { BankDateFormat, CommandType, CustomerStatus, Role } from '../shared/enums';
import { applyCommand } from '../shared/domain';
import { emptyWorkspace } from '../shared/seed';
import { snapshotSchema } from '../shared/schema';
import type { Command } from '../shared/schema';

const now = new Date('2026-10-03T12:00:00.000Z');
const customerCsv =
  'name,contact,email,phone,city,tax_id,salesperson,credit_limit,terms\n' +
  'Ali Traders,Ali Hassan,ali@example.com,+923001234567,Lahore,,Sales Team,100000,30';
const invoiceCsv =
  'number,customer,issued_at,due_at,amount,reference\n' +
  'INV-1,Ali Traders,2026-09-01,2026-09-30,1000,order-1';
const bankCsv =
  'date,reference,description,bank,credit,debit,customer\n' +
  '2026-10-02,TX-1,"Transfer, Ali",Test Bank,400,0,Ali Traders\n' +
  '2026-10-02,OUT-1,Outgoing,Test Bank,0,50,';

function preparedWorkspace() {
  let workspace = emptyWorkspace('org-1', 'Test Company');
  workspace = applyCommand(
    workspace,
    importCommand(ImportKind.Customers, customerCsv, workspace),
    'Test Owner',
    Role.Owner,
    now,
  );
  workspace = applyCommand(
    workspace,
    importCommand(ImportKind.Invoices, invoiceCsv, workspace),
    'Test Owner',
    Role.Owner,
    now,
  );

  return workspace;
}

describe('CSV upload workflow', () => {
  it('reviews every bank row, flags duplicates, and refuses to import a mixed-validity batch', () => {
    const workspace = preparedWorkspace();
    const review = inspectImport(
      ImportKind.Payments,
      'date,reference,bank,credit,debit,customer\n' +
        '2026-10-02,TX-1,Test Bank,100,0,Ali Traders\n' +
        '2026-10-02,OUT,Test Bank,0,25,\n' +
        '2026-10-02,tx-1,Test Bank,100,0,Ali Traders\n' +
        '2026-10-02,TX-3,Test Bank,100,0,Unknown',
      workspace,
    );
    expect(review.rows.map((row) => row.status)).toEqual(['ready', 'skipped', 'error', 'error']);
    expect(review.rows.map((row) => row.rowNumber)).toEqual([2, 3, 4, 5]);
    expect(review.readyCount).toBe(1);
    expect(review.skippedCount).toBe(1);
    expect(review.errorCount).toBe(2);
    expect(review.command).toBeNull();
    expect(workspace.payments).toHaveLength(0);
  });

  it('keeps a successful import source in the durable audit history', () => {
    const workspace = preparedWorkspace();
    const review = inspectImport(ImportKind.Payments, bankCsv, workspace);
    expect(review.rows.map((row) => row.status)).toEqual(['ready', 'skipped']);
    expect(review.command?.type).toBe(CommandType.ImportPayments);
    if (review.command?.type !== CommandType.ImportPayments) {
      throw new Error('Expected a bank import command');
    }
    const imported = applyCommand(
      workspace,
      { ...review.command, sourceName: 'October HBL.csv' },
      'Test Owner',
      Role.Owner,
      now,
    );
    expect(imported.audit[0]?.detail).toContain('October HBL.csv');
    expect(imported.payments).toHaveLength(1);
  });

  it('imports a quoted bank receipt, skips debits, and keeps the invoice unpaid until allocation', () => {
    const workspace = preparedWorkspace();
    const command = importCommand(ImportKind.Payments, bankCsv, workspace);
    expect(command.type).toBe(CommandType.ImportPayments);
    if (command.type !== CommandType.ImportPayments) {
      throw new Error('Wrong command');
    }
    expect(command.payments).toHaveLength(1);
    expect(command.payments[0]?.amount).toBe(40_000);
    expect(command.payments[0]?.description).toBe('Transfer, Ali');
    const imported = applyCommand(workspace, command, 'Test Owner', Role.Owner, now);
    expect(imported.invoices[0]?.paid).toBe(0);
    expect(imported.payments[0]?.allocations).toEqual([]);
    const allocated = applyCommand(
      imported,
      {
        type: CommandType.AllocatePayment,
        paymentId: imported.payments[0]!.id,
        customerId: imported.customers[0]!.id,
        allocations: [{ invoiceId: imported.invoices[0]!.id, amount: 40_000 }],
      },
      'Test Owner',
      Role.Owner,
      now,
    );
    expect(allocated.invoices[0]?.paid).toBe(40_000);
    expect(allocated.payments[0]?.status).toBe('Matched');
  });

  it('rejects duplicate receipt references across and within batches without changing the original', () => {
    const workspace = preparedWorkspace();
    const command = importCommand(
      ImportKind.Payments,
      'date,reference,bank,credit\n2026-10-02,TX-1,Test Bank,100\n2026-10-02,tx-1,Test Bank,100',
      workspace,
    );
    expect(() => applyCommand(workspace, command, 'Test Owner', Role.Owner, now)).toThrow(
      'already exists',
    );
    expect(workspace.payments).toHaveLength(0);
    const imported = applyCommand(
      workspace,
      importCommand(ImportKind.Payments, bankCsv, workspace),
      'Test Owner',
      Role.Owner,
      now,
    );
    expect(() => applyCommand(imported, command, 'Test Owner', Role.Owner, now)).toThrow(
      'already exists',
    );
    expect(imported.payments).toHaveLength(1);
  });

  it('rejects malformed CSV, unknown customers, and duplicate invoice numbers in a batch', () => {
    expect(() => parseCsv('name,amount\n"broken"tail,2')).toThrow();
    expect(() => parseCsv('name,amount\nabc"def,2')).toThrow();
    expect(() => parseCsv(`name\n${'a'.repeat(1_600_000)}`)).toThrow('1.5 MB');
    expect(() => parseCsv(`name\n${'é'.repeat(800_000)}`)).toThrow('1.5 MB');
    const workspace = preparedWorkspace();
    expect(() =>
      importCommand(ImportKind.Invoices, invoiceCsv.replace('Ali Traders', 'Nobody'), workspace),
    ).toThrow('was not found');
    const duplicate = importCommand(
      ImportKind.Invoices,
      invoiceCsv.replace('INV-1', 'INV-2') +
        '\nINV-2,Ali Traders,2026-09-01,2026-09-30,500,order-2',
      workspace,
    );
    expect(() => applyCommand(workspace, duplicate, 'Test Owner', Role.Owner, now)).toThrow(
      'already exists',
    );
    expect(workspace.invoices).toHaveLength(1);
  });

  it('maps common bank statement headers and refuses ambiguous or malformed amounts', () => {
    const workspace = preparedWorkspace();
    const mapped = importCommand(
      ImportKind.Payments,
      'Transaction Date,Transaction ID,Narration,Bank Name,Deposit,Withdrawal,Customer Name\n' +
        '2026-10-02,TX-2,Settlement,Test Bank,250.50,0,Ali Traders',
      workspace,
    );
    expect(mapped.type).toBe(CommandType.ImportPayments);
    if (mapped.type !== CommandType.ImportPayments) {
      throw new Error('Wrong command');
    }
    expect(mapped.payments[0]).toMatchObject({
      reference: 'TX-2',
      amount: 25_050,
      description: 'Settlement',
      bank: 'Test Bank',
    });
    expect(() =>
      importCommand(
        ImportKind.Payments,
        'date,reference,transaction_id,credit\n2026-10-02,TX-2,OTHER,10',
        workspace,
      ),
    ).toThrow('Use only one column');
    expect(() =>
      importCommand(
        ImportKind.Payments,
        'date,reference,credit,debit\n2026-10-02,TX-2,10,not-a-number',
        workspace,
      ),
    ).toThrow('invalid debit');
    expect(() =>
      importCommand(
        ImportKind.Payments,
        'date,reference,credit,debit\n2026-10-02,TX-2,10,5',
        workspace,
      ),
    ).toThrow('both a debit and a credit');
    const custom = importCommand(
      ImportKind.Payments,
      'Posting,Trace,Inflow,Text\n02/10/2026,TRACE-1,75.25,Shop settlement',
      workspace,
      {
        columns: { date: 'Posting', reference: 'Trace', credit: 'Inflow', description: 'Text' },
        dateFormat: BankDateFormat.DayMonthYear,
      },
    );
    expect(custom.type).toBe(CommandType.ImportPayments);
    if (custom.type !== CommandType.ImportPayments) {
      throw new Error('Wrong command');
    }
    expect(custom.payments[0]).toMatchObject({
      date: '2026-10-02',
      reference: 'TRACE-1',
      amount: 7_525,
      description: 'Shop settlement',
    });
  });

  it('updates customer details without changing the credit limit or breaking linked invoices', () => {
    const workspace = preparedWorkspace();
    const customer = workspace.customers[0]!;
    const invoiceId = workspace.invoices[0]!.customerId;
    const updated = applyCommand(
      workspace,
      {
        type: CommandType.UpdateCustomer,
        customerId: customer.id,
        customer: {
          name: 'Ali Trading Co',
          contact: customer.contact,
          email: customer.email,
          phone: customer.phone,
          city: 'Karachi',
          taxId: customer.taxId,
          salesperson: customer.salesperson,
          terms: 45,
          status: CustomerStatus.OnHold,
        },
      },
      'Test Owner',
      Role.Owner,
      now,
    );
    expect(updated.customers[0]).toMatchObject({
      name: 'Ali Trading Co',
      city: 'Karachi',
      terms: 45,
      status: CustomerStatus.OnHold,
      creditLimit: customer.creditLimit,
    });
    expect(updated.invoices[0]?.customerId).toBe(invoiceId);
    expect(workspace.customers[0]?.name).toBe('Ali Traders');
  });
});

let app: INestApplication;
let url: string;

beforeAll(async () => {
  process.env['TEST_DATABASE'] = 'true';
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
}, 30000);

afterAll(async () => {
  await app.close();
  delete process.env['TEST_DATABASE'];
});

describe('concurrent workspace writes', () => {
  it('stores validated bank mappings per company and keeps another company isolated', async () => {
    const accounts = app.get(AccountsService);
    await accounts.createCompany({
      name: 'Import Owner',
      organization: 'Import Company',
      email: 'import-owner@example.com',
      password: 'A-long-secure-password-123',
    });
    await accounts.createCompany({
      name: 'Other Owner',
      organization: 'Other Company',
      email: 'other-owner@example.com',
      password: 'A-long-secure-password-123',
    });
    const login = async (email: string) => {
      const response = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'A-long-secure-password-123' }),
      });

      return response.headers.get('set-cookie')?.split(';')[0] ?? '';
    };
    const ownerCookie = await login('import-owner@example.com');
    const otherCookie = await login('other-owner@example.com');
    const profile = {
      name: 'HBL statement',
      dateFormat: BankDateFormat.DayMonthYear,
      columns: {
        date: 'Posting',
        reference: 'Trace',
        credit: 'Inflow',
        debit: '',
        amount: '',
        description: 'Narration',
        bank: '',
        customer: '',
      },
    };
    const saved = await fetch(`${url}/workspace/bank-import-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify(profile),
    });
    expect(saved.status).toBe(201);
    expect(await saved.json()).toEqual([profile]);
    const own = await fetch(`${url}/workspace/bank-import-profiles`, {
      headers: { Cookie: ownerCookie },
    });
    expect(await own.json()).toEqual([profile]);
    const other = await fetch(`${url}/workspace/bank-import-profiles`, {
      headers: { Cookie: otherCookie },
    });
    expect(await other.json()).toEqual([]);
    const invalid = await fetch(`${url}/workspace/bank-import-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ ...profile, dateFormat: 'guess' }),
    });
    expect(invalid.status).toBe(400);

    const concurrentUpdates = await Promise.all(
      [BankDateFormat.DayMonthYear, BankDateFormat.Iso].map((dateFormat) =>
        fetch(`${url}/workspace/bank-import-profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
          body: JSON.stringify({ ...profile, dateFormat }),
        }),
      ),
    );
    expect(concurrentUpdates.map((response) => response.status)).toEqual([201, 201]);

    const updated = await fetch(`${url}/workspace/bank-import-profiles`, {
      headers: { Cookie: ownerCookie },
    });
    const updatedProfiles = (await updated.json()) as (typeof profile)[];
    expect(updatedProfiles).toHaveLength(1);
    expect([BankDateFormat.DayMonthYear, BankDateFormat.Iso]).toContain(
      updatedProfiles[0]?.dateFormat,
    );
  });

  it('commits one of two writes based on the same revision and preserves the winner', async () => {
    await app.get(AccountsService).createCompany({
      name: 'Race Owner',
      organization: 'Race Company',
      email: 'race@example.com',
      password: 'A-long-secure-password-123',
    });
    const login = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'race@example.com', password: 'A-long-secure-password-123' }),
    });
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    const initial = snapshotSchema.parse(
      await (await fetch(`${url}/workspace`, { headers: { Cookie: cookie } })).json(),
    );
    const makeCommand = (name: string): Command => ({
      type: CommandType.ImportCustomers,
      customers: [
        {
          name,
          contact: 'Ali Hassan',
          email: `${name.toLowerCase().replaceAll(' ', '')}@example.com`,
          phone: '+923001234567',
          city: 'Lahore',
          taxId: '',
          salesperson: 'Sales Team',
          creditLimit: 100_000,
          terms: 30,
          status: CustomerStatus.Active,
        },
      ],
    });
    const send = (name: string) =>
      fetch(`${url}/workspace/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ revision: initial.revision, command: makeCommand(name) }),
      });
    const responses = await Promise.all([send('Customer A'), send('Customer B')]);
    const results = await Promise.all(
      responses.map(async (response) => ({ status: response.status, body: await response.text() })),
    );
    expect(results.map((result) => result.status).sort(), JSON.stringify(results)).toEqual([
      201, 409,
    ]);
    const current = snapshotSchema.parse(
      await (await fetch(`${url}/workspace`, { headers: { Cookie: cookie } })).json(),
    );
    expect(current.revision).toBe(initial.revision + 1);
    expect(current.workspace.customers).toHaveLength(1);
    expect(['Customer A', 'Customer B']).toContain(current.workspace.customers[0]?.name);

    const mutate = (revision: number, command: Command, requestId?: string) =>
      fetch(`${url}/workspace/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ revision, command, requestId }),
      });
    const invoiceCommand = importCommand(
      ImportKind.Invoices,
      `number,customer,issued_at,due_at,amount,reference\nRACE-1,${current.workspace.customers[0]!.name},2020-01-01,2020-01-31,1000,order`,
      current.workspace,
    );
    const invoiceResponse = await mutate(current.revision, invoiceCommand);
    expect(invoiceResponse.status).toBe(201);
    const invoiced = snapshotSchema.parse(await invoiceResponse.json());
    const paymentCommand = importCommand(
      ImportKind.Payments,
      `date,reference,bank,credit,customer\n2020-02-01,RACE-TX,Test Bank,1000,${current.workspace.customers[0]!.name}`,
      invoiced.workspace,
    );
    const paymentResponse = await mutate(invoiced.revision, paymentCommand);
    expect(paymentResponse.status).toBe(201);
    const withPayment = snapshotSchema.parse(await paymentResponse.json());
    const allocation: Command = {
      type: CommandType.AllocatePayment,
      paymentId: withPayment.workspace.payments[0]!.id,
      customerId: withPayment.workspace.customers[0]!.id,
      allocations: [{ invoiceId: withPayment.workspace.invoices[0]!.id, amount: 100_000 }],
    };
    const competing = await Promise.all([
      mutate(withPayment.revision, allocation),
      mutate(withPayment.revision, allocation),
    ]);
    expect(competing.map((response) => response.status).sort()).toEqual([201, 409]);
    const final = snapshotSchema.parse(
      await (await fetch(`${url}/workspace`, { headers: { Cookie: cookie } })).json(),
    );
    expect(final.workspace.invoices[0]?.paid).toBe(100_000);
    expect(final.workspace.payments[0]?.allocations).toHaveLength(1);

    const requestId = crypto.randomUUID();
    const updatedCustomer: Command = {
      type: CommandType.UpdateCustomer,
      customerId: final.workspace.customers[0]!.id,
      customer: {
        name: 'Final Customer',
        contact: 'Ali Hassan',
        email: 'final@example.com',
        phone: '+923001234567',
        city: 'Lahore',
        taxId: '',
        salesperson: 'Sales Team',
        terms: 30,
        status: CustomerStatus.Active,
      },
    };
    const first = await mutate(final.revision, updatedCustomer, requestId);
    expect(first.status).toBe(201);
    const firstResult = snapshotSchema.parse(await first.json());
    const replay = await mutate(final.revision, updatedCustomer, requestId);
    expect(replay.status).toBe(201);
    const replayResult = snapshotSchema.parse(await replay.json());
    expect(replayResult.revision).toBe(firstResult.revision);
    expect(replayResult.workspace.audit).toHaveLength(firstResult.workspace.audit.length);
    const reused = await mutate(
      final.revision,
      { ...updatedCustomer, customer: { ...updatedCustomer.customer, name: 'Different' } },
      requestId,
    );
    expect(reused.status).toBe(409);

    const repository = app.get(WorkspaceRepository);
    const organizationId = firstResult.workspace.organization.id;
    expect(await repository.findReminderCandidateIds(10)).not.toContain(organizationId);
    const enabled = await mutate(firstResult.revision, {
      type: CommandType.UpdateSettings,
      settings: { ...firstResult.workspace.settings, remindersEnabled: true, reminderHour: 10 },
    });
    expect(enabled.status).toBe(201);
    expect(await repository.findReminderCandidateIds(9)).not.toContain(organizationId);
    expect(await repository.findReminderCandidateIds(10)).toContain(organizationId);
  });
});
