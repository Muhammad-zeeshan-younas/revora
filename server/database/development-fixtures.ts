import {
  CommunicationChannel,
  CustomerStatus,
  InteractionOutcome,
  InvoiceStatus,
  MessageDirection,
  PaymentMethod,
  PaymentStatus,
  PromiseStatus,
  ReminderStatus,
  Role,
} from '../../shared/enums';
import { offsetDate, today } from '../../shared/finance';
import { createDemo, emptyWorkspace } from '../../shared/seed';
import { workspaceSchema } from '../../shared/schema';
import type { Customer, Invoice, Workspace } from '../../shared/schema';

// Public, development-only credentials. The seed command refuses non-development environments.
export const DEVELOPMENT_PASSWORD = 'RevoraDev!2026';
export const DEVELOPMENT_ORGANIZATION_ID = 'revora-development';
export const ISOLATED_ORGANIZATION_ID = 'revora-development-isolated';

interface DevelopmentAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
}

export const developmentAccounts: DevelopmentAccount[] = Object.values(Role).map((role) => ({
  id: `dev-user-${role.toLowerCase()}`,
  name: `Demo ${role}`,
  email: `${role.toLowerCase()}@revora.test`,
  role,
  organizationId: DEVELOPMENT_ORGANIZATION_ID,
}));

developmentAccounts.push({
  id: 'dev-user-isolated',
  name: 'Demo Isolated Owner',
  email: 'isolated@revora.test',
  role: Role.Owner,
  organizationId: ISOLATED_ORGANIZATION_ID,
});

function scenarioCustomer(id: string, name: string, creditLimit = 200_000): Customer {
  return {
    id,
    name,
    contact: 'Demo Contact',
    email: `${id}@example.com`,
    phone: '+923000000000',
    city: 'Karachi',
    taxId: '',
    salesperson: 'Demo Sales',
    creditLimit: creditLimit * 100,
    terms: 30,
    status: CustomerStatus.Active,
  };
}

function scenarioInvoice(
  number: string,
  customerId: string,
  amount: number,
  dueOffset: number,
  date: string,
  paid = 0,
  status: Invoice['status'] = InvoiceStatus.Open,
): Invoice {
  return {
    id: number,
    number,
    customerId,
    amount: amount * 100,
    paid: paid * 100,
    issuedAt: offsetDate(date, Math.min(dueOffset, 0) - 30),
    dueAt: offsetDate(date, dueOffset),
    status,
    reference: 'Development scenario',
  };
}

export function createDevelopmentWorkspaces(now = new Date()): Workspace[] {
  const date = today(now);
  const workspace = createDemo(DEVELOPMENT_ORGANIZATION_ID, now);
  workspace.organization.name = 'Revora Demo Trading';
  const hold = scenarioCustomer('dev-hold', 'Seed Credit Hold', 0);
  hold.status = CustomerStatus.OnHold;
  workspace.customers.push(
    scenarioCustomer('dev-partial', 'Seed Partial Payments'),
    scenarioCustomer('dev-reversed', 'Seed Reversed Payment'),
    hold,
    scenarioCustomer('dev-today', 'Seed Due Today', 75_000),
    scenarioCustomer('dev-kept', 'Seed Settled Account'),
    scenarioCustomer('dev-empty', 'Seed New Customer'),
  );
  workspace.invoices.push(
    scenarioInvoice('DEV-1001', 'dev-partial', 100_000, 7, date, 40_000),
    scenarioInvoice('DEV-1002', 'dev-partial', 60_000, -10, date, 20_000),
    scenarioInvoice('DEV-2001', 'dev-reversed', 50_000, -45, date),
    scenarioInvoice('DEV-3001', 'dev-hold', 25_000, -5, date),
    scenarioInvoice('DEV-4001', 'dev-today', 75_000, 0, date),
    scenarioInvoice('DEV-4002', 'dev-today', 10_000, 5, date, 0, InvoiceStatus.Draft),
    scenarioInvoice('DEV-4003', 'dev-today', 5_000, -90, date, 0, InvoiceStatus.WrittenOff),
    scenarioInvoice('DEV-5001', 'dev-kept', 30_000, -2, date, 30_000),
  );
  workspace.payments.unshift(
    {
      id: 'dev-payment-partial',
      customerId: 'dev-partial',
      amount: 80_000 * 100,
      date,
      reference: 'DEV-PARTIAL',
      description: 'Rs 60,000 allocated across two invoices; Rs 20,000 available to allocate.',
      bank: 'Demo Bank',
      method: PaymentMethod.BankTransfer,
      status: PaymentStatus.Partial,
      allocations: [
        { invoiceId: 'DEV-1001', amount: 40_000 * 100 },
        { invoiceId: 'DEV-1002', amount: 20_000 * 100 },
      ],
    },
    {
      id: 'dev-payment-reversed',
      customerId: 'dev-reversed',
      amount: 50_000 * 100,
      date: offsetDate(date, -1),
      reference: 'DEV-REVERSED',
      description: 'Reversed receipt: historical allocation retained, invoice balance restored.',
      bank: 'Demo Bank',
      method: PaymentMethod.Cheque,
      status: PaymentStatus.Reversed,
      allocations: [{ invoiceId: 'DEV-2001', amount: 50_000 * 100 }],
    },
    {
      id: 'dev-payment-settled',
      customerId: 'dev-kept',
      amount: 30_000 * 100,
      date,
      reference: 'DEV-SETTLED',
      description: 'Fully settled invoice and fulfilled payment promise.',
      bank: 'Demo Bank',
      method: PaymentMethod.Raast,
      status: PaymentStatus.Matched,
      allocations: [{ invoiceId: 'DEV-5001', amount: 30_000 * 100 }],
    },
  );
  const createdAt = new Date(now.getTime() - 86_400_000).toISOString();
  workspace.promises.push(
    {
      id: 'dev-promise-partial',
      customerId: 'dev-partial',
      amount: 80_000 * 100,
      date: offsetDate(date, 2),
      createdAt,
      status: PromiseStatus.PartiallyKept,
      note: 'Rs 60,000 allocated against an Rs 80,000 commitment.',
      baselineAllocations: [],
    },
    {
      id: 'dev-promise-kept',
      customerId: 'dev-kept',
      amount: 30_000 * 100,
      date,
      createdAt,
      status: PromiseStatus.Kept,
      note: 'Receipt allocated in full within the commitment window.',
      baselineAllocations: [],
    },
    {
      id: 'dev-promise-cancelled',
      customerId: 'dev-reversed',
      amount: 50_000 * 100,
      date: offsetDate(date, 1),
      createdAt,
      status: PromiseStatus.Cancelled,
      note: 'Commitment cancelled after receipt reversal.',
      baselineAllocations: [],
    },
  );
  workspace.interactions.push({
    id: 'dev-interaction-dispute',
    customerId: 'customer-9',
    at: now.toISOString(),
    author: 'Demo Collections',
    channel: CommunicationChannel.Email,
    message: 'Customer disputes INV-2425. Request the signed delivery note before follow-up.',
    outcome: InteractionOutcome.Dispute,
    nextAction: 'Review delivery note',
    direction: MessageDirection.Inbound,
  });
  workspace.jobs.push({
    id: 'dev-reminder-prepared',
    customerId: 'dev-reversed',
    scheduledAt: createdAt,
    status: ReminderStatus.Prepared,
    createdBy: 'Demo Collections',
    message: 'Sample outbox reminder for DEV-2001. No message has been sent.',
  });
  workspace.jobs.push({
    id: 'dev-reminder-cancelled',
    customerId: 'dev-hold',
    scheduledAt: createdAt,
    status: ReminderStatus.Cancelled,
    createdBy: 'Demo Collections',
    message: 'Sample reminder cancelled because this customer is on hold.',
  });
  const isolated = emptyWorkspace(ISOLATED_ORGANIZATION_ID, 'Revora Isolated Demo');
  for (const data of [workspace, isolated]) {
    data.members = developmentAccounts
      .filter((account) => account.organizationId === data.organization.id)
      .map(({ id, name, email, role }) => ({ id, name, email, role }));
  }

  return [workspace, isolated].map((data) => workspaceSchema.parse(data));
}
