import {
  CommandType,
  CustomerStatus,
  InvoiceStatus,
  PaymentStatus,
  PromiseStatus,
  ReminderStatus,
  Role,
} from './enums';
import { account, balance, today } from './finance';
import type { Command, Workspace } from './schema';

export function allowed(role: Role, type: Command['type']): boolean {
  if (role === Role.Owner || role === Role.Admin) {
    return true;
  }
  if (role === Role.Viewer || role === Role.Sales) {
    return false;
  }
  if (
    [CommandType.UpdateCredit, CommandType.UpdateSettings, CommandType.UpdateMemberRole].includes(
      type,
    )
  ) {
    return false;
  }
  if (role === Role.Accountant) {
    return true;
  }

  return [
    CommandType.CreateInteraction,
    CommandType.CreatePromise,
    CommandType.CancelPromise,
    CommandType.QueueReminder,
    CommandType.CancelReminder,
  ].includes(type);
}
export function refreshPromises(workspace: Workspace, date = today()): void {
  for (const promise of workspace.promises) {
    if (promise.status === PromiseStatus.Cancelled) {
      continue;
    }
    const paid = workspace.payments
      .filter(
        (payment) =>
          payment.customerId === promise.customerId &&
          payment.status !== PaymentStatus.Reversed &&
          payment.date >= today(new Date(promise.createdAt)) &&
          payment.date <= promise.date,
      )
      .reduce(
        (sum, payment) =>
          sum +
          Math.max(
            0,
            payment.allocations.reduce((total, allocation) => total + allocation.amount, 0) -
              (promise.baselineAllocations?.find((item) => item.paymentId === payment.id)?.amount ??
                0),
          ),
        0,
      );
    promise.status =
      paid >= promise.amount
        ? PromiseStatus.Kept
        : paid > 0
          ? PromiseStatus.PartiallyKept
          : promise.date < date
            ? PromiseStatus.Broken
            : PromiseStatus.Pending;
  }
}
export function applyCommand(
  original: Workspace,
  command: Command,
  actor: string,
  role: Role,
  now = new Date(),
): Workspace {
  if (!allowed(role, command.type)) {
    throw new Error('Your role cannot perform this action.');
  }
  const workspace = structuredClone(original);
  const stamp = now.toISOString();
  const date = today(now);
  let detail = '';
  let entityId = '';

  function customerExists(customerId: string): void {
    if (!workspace.customers.some((customer) => customer.id === customerId)) {
      throw new Error('Customer does not belong to this workspace.');
    }
  }
  switch (command.type) {
    case CommandType.CreateCustomer:
    case CommandType.ImportCustomers: {
      const customers =
        command.type === CommandType.CreateCustomer ? [command.customer] : command.customers;
      for (const customer of customers) {
        if (
          workspace.customers.some(
            (item) => item.name.toLowerCase() === customer.name.toLowerCase(),
          )
        ) {
          throw new Error(`Customer ${customer.name} already exists. No rows were imported.`);
        }
        workspace.customers.push({ ...customer, id: crypto.randomUUID() });
      }
      detail = `${customers.length} customer account${customers.length === 1 ? '' : 's'} added`;
      break;
    }
    case CommandType.CreateInvoice:
    case CommandType.ImportInvoices: {
      const invoices =
        command.type === CommandType.CreateInvoice ? [command.invoice] : command.invoices;
      for (const invoice of invoices) {
        customerExists(invoice.customerId);
        if (invoice.issuedAt > date) {
          throw new Error('Invoice date cannot be in the future.');
        }
        if (
          workspace.invoices.some(
            (item) => item.number.toLowerCase() === invoice.number.toLowerCase(),
          )
        ) {
          throw new Error(`Invoice ${invoice.number} already exists. No rows were imported.`);
        }
        workspace.invoices.push({ ...invoice, id: crypto.randomUUID(), paid: 0 });
      }
      detail = `${invoices.length} invoice${invoices.length === 1 ? '' : 's'} created`;
      break;
    }
    case CommandType.DisputeInvoice: {
      const invoice = workspace.invoices.find((item) => item.id === command.invoiceId);
      if (
        !invoice ||
        balance(invoice) <= 0 ||
        ![InvoiceStatus.Open, InvoiceStatus.Disputed].includes(invoice.status)
      ) {
        throw new Error('Only outstanding invoices can be disputed.');
      }
      invoice.status = command.disputed ? InvoiceStatus.Disputed : InvoiceStatus.Open;
      detail = `${invoice.number}: ${command.disputed ? 'dispute opened' : 'dispute resolved'}. ${command.reason}`;
      entityId = invoice.id;
      break;
    }
    case CommandType.CreatePayment:
    case CommandType.ImportPayments: {
      const payments =
        command.type === CommandType.CreatePayment ? [command.payment] : command.payments;
      for (const payment of payments) {
        if (payment.customerId) {
          customerExists(payment.customerId);
        }
        if (payment.date > date) {
          throw new Error('Payment date cannot be in the future.');
        }
        if (
          workspace.payments.some(
            (item) =>
              item.bank === payment.bank &&
              item.reference.toLowerCase() === payment.reference.toLowerCase(),
          )
        ) {
          throw new Error(
            `Reference ${payment.reference} already exists for this bank. No rows were imported.`,
          );
        }
        workspace.payments.push({
          ...payment,
          id: crypto.randomUUID(),
          allocations: [],
          status: PaymentStatus.Unmatched,
        });
      }
      detail = `${payments.length} payment${payments.length === 1 ? '' : 's'} added for review`;
      break;
    }
    case CommandType.AllocatePayment: {
      customerExists(command.customerId);
      const payment = workspace.payments.find((item) => item.id === command.paymentId);
      if (!payment || payment.status === PaymentStatus.Reversed) {
        throw new Error('Payment is unavailable.');
      }
      if (payment.customerId && payment.customerId !== command.customerId) {
        throw new Error('Payment belongs to a different customer.');
      }
      const used = payment.allocations.reduce((sum, item) => sum + item.amount, 0);
      const proposed = command.allocations.reduce((sum, item) => sum + item.amount, 0);
      if (used + proposed > payment.amount) {
        throw new Error('Allocations exceed the remaining payment amount.');
      }
      if (
        new Set(command.allocations.map((item) => item.invoiceId)).size !==
        command.allocations.length
      ) {
        throw new Error('Duplicate invoice in allocation.');
      }
      for (const allocation of command.allocations) {
        const invoice = workspace.invoices.find(
          (item) => item.id === allocation.invoiceId && item.customerId === command.customerId,
        );
        if (!invoice || invoice.status !== InvoiceStatus.Open) {
          throw new Error('Only open invoices belonging to this customer can receive payments.');
        }
        if (allocation.amount > balance(invoice)) {
          throw new Error(`Allocation exceeds ${invoice.number}'s outstanding balance.`);
        }
        invoice.paid += allocation.amount;
      }
      payment.allocations.push(...command.allocations);
      payment.customerId = command.customerId;
      payment.status =
        used + proposed === payment.amount ? PaymentStatus.Matched : PaymentStatus.Partial;
      detail = `${payment.reference} allocated to ${command.allocations.length} invoice${command.allocations.length === 1 ? '' : 's'}`;
      entityId = payment.id;
      break;
    }
    case CommandType.ReversePayment: {
      const payment = workspace.payments.find((item) => item.id === command.paymentId);
      if (
        !payment ||
        payment.status === PaymentStatus.Reversed ||
        payment.allocations.length === 0
      ) {
        throw new Error('This payment has no active allocations.');
      }
      for (const allocation of payment.allocations) {
        const invoice = workspace.invoices.find((item) => item.id === allocation.invoiceId);
        if (!invoice || invoice.paid < allocation.amount) {
          throw new Error('Ledger inconsistency. Contact an administrator.');
        }
        invoice.paid -= allocation.amount;
      }
      payment.status = PaymentStatus.Reversed;
      detail = `${payment.reference} allocations reversed. ${command.reason}`;
      entityId = payment.id;
      break;
    }
    case CommandType.CreatePromise: {
      customerExists(command.customerId);
      if (command.date < date) {
        throw new Error('A new promise must be for today or a future date.');
      }
      if (command.amount > account(workspace, command.customerId, date).outstanding) {
        throw new Error('Promise exceeds the outstanding customer balance.');
      }
      if (
        workspace.promises.some(
          (item) =>
            item.customerId === command.customerId &&
            [PromiseStatus.Pending, PromiseStatus.PartiallyKept].includes(item.status),
        )
      ) {
        throw new Error('Resolve or cancel the existing active promise first.');
      }
      entityId = crypto.randomUUID();
      const baselineAllocations = workspace.payments
        .filter(
          (payment) =>
            payment.customerId === command.customerId && payment.status !== PaymentStatus.Reversed,
        )
        .map((payment) => ({
          paymentId: payment.id,
          amount: payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
        }));
      workspace.promises.push({
        id: entityId,
        customerId: command.customerId,
        amount: command.amount,
        date: command.date,
        note: command.note,
        createdAt: stamp,
        status: PromiseStatus.Pending,
        baselineAllocations,
      });
      detail = `Payment promise recorded for ${command.date}`;
      break;
    }
    case CommandType.CancelPromise: {
      const promise = workspace.promises.find((item) => item.id === command.promiseId);
      if (
        !promise ||
        ![PromiseStatus.Pending, PromiseStatus.PartiallyKept, PromiseStatus.Broken].includes(
          promise.status,
        )
      ) {
        throw new Error('Promise cannot be cancelled.');
      }
      promise.status = PromiseStatus.Cancelled;
      entityId = promise.id;
      detail = 'Payment promise cancelled';
      break;
    }
    case CommandType.CreateInteraction: {
      customerExists(command.interaction.customerId);
      entityId = crypto.randomUUID();
      workspace.interactions.unshift({
        ...command.interaction,
        id: entityId,
        at: stamp,
        author: actor,
      });
      detail = `${command.interaction.channel} interaction recorded: ${command.interaction.outcome}`;
      break;
    }
    case CommandType.QueueReminder: {
      customerExists(command.customerId);
      const customer = workspace.customers.find((item) => item.id === command.customerId);
      if (!customer || customer.status === CustomerStatus.OnHold) {
        throw new Error('Reminders are paused for this customer.');
      }
      if (account(workspace, customer.id, date).overdue <= 0) {
        throw new Error('This account has no overdue balance.');
      }
      if (
        workspace.jobs.some(
          (job) =>
            job.customerId === customer.id &&
            today(new Date(job.scheduledAt)) === date &&
            job.status !== ReminderStatus.Cancelled,
        )
      ) {
        throw new Error('A reminder already exists for this customer today.');
      }
      if (
        workspace.jobs.filter(
          (job) =>
            today(new Date(job.scheduledAt)) === date && job.status !== ReminderStatus.Cancelled,
        ).length >= workspace.settings.dailyLimit
      ) {
        throw new Error('Daily reminder limit reached.');
      }
      const invoice = workspace.invoices
        .filter((item) => item.customerId === customer.id && balance(item) > 0)
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
      const message = workspace.settings.template
        .replaceAll('{{customer}}', customer.name)
        .replaceAll('{{amount}}', String(account(workspace, customer.id, date).outstanding / 100))
        .replaceAll('{{invoice}}', invoice?.number ?? 'your account');
      workspace.jobs.unshift({
        id: crypto.randomUUID(),
        customerId: customer.id,
        message,
        scheduledAt: stamp,
        status: ReminderStatus.Queued,
        createdBy: actor,
      });
      detail = `Reminder queued for ${customer.name}`;
      entityId = customer.id;
      break;
    }
    case CommandType.CancelReminder: {
      const job = workspace.jobs.find((item) => item.id === command.jobId);
      if (!job || job.status === ReminderStatus.Cancelled) {
        throw new Error('Reminder is unavailable.');
      }
      job.status = ReminderStatus.Cancelled;
      detail = 'Reminder cancelled';
      entityId = job.id;
      break;
    }
    case CommandType.UpdateCredit: {
      const customer = workspace.customers.find((item) => item.id === command.customerId);
      if (!customer) {
        throw new Error('Customer is unavailable.');
      }
      detail = `${customer.name}: credit limit changed from Rs ${customer.creditLimit / 100} to Rs ${command.limit / 100}. ${command.reason}`;
      customer.creditLimit = command.limit;
      entityId = customer.id;
      break;
    }
    case CommandType.UpdateSettings:
      workspace.settings = command.settings;
      detail = 'Collection rules updated';
      break;
    case CommandType.UpdateMemberRole: {
      if (role !== Role.Owner) {
        throw new Error('Only the owner can change roles.');
      }
      const member = workspace.members.find((item) => item.id === command.memberId);
      if (!member || member.role === Role.Owner || command.role === Role.Owner) {
        throw new Error('Ownership cannot be changed here.');
      }
      member.role = command.role;
      detail = `${member.name} assigned the ${command.role} role`;
      entityId = member.id;
      break;
    }
  }
  refreshPromises(workspace, date);
  workspace.audit.unshift({
    id: crypto.randomUUID(),
    at: stamp,
    actor,
    action: command.type,
    detail,
    entityId,
  });

  return workspace;
}
