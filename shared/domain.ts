import {
  CommandType,
  CustomerStatus,
  InvoiceStatus,
  InvoiceCorrectionKind,
  InvoiceAdjustmentDirection,
  WriteOffStatus,
  PaymentStatus,
  PromiseStatus,
  ReminderStatus,
  Role,
} from './enums';
import { account, balance, today } from './finance';
import { FINANCE } from './constants';
import { groupBy } from './collections';
import { paymentReferenceKey } from './payment-reference';
import { reconcileBankStatement } from './reconciliation';
import type { Command, Workspace } from './schema';

export function allowed(role: Role, type: Command['type']): boolean {
  if (role === Role.Owner || role === Role.Admin) {
    return true;
  }
  if (role === Role.Viewer) {
    return false;
  }
  if (role === Role.Sales) {
    return [CommandType.CreateInteraction, CommandType.CreatePromise].includes(type);
  }
  if (
    [
      CommandType.UpdateCredit,
      CommandType.UpdateSettings,
      CommandType.UpdateMemberRole,
      CommandType.ReviewWriteOff,
    ].includes(type)
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
  const paymentsByCustomer = groupBy(
    workspace.payments.filter((payment) => payment.status !== PaymentStatus.Reversed),
    (payment) => payment.customerId,
  );
  const allocatedByPayment = new Map(
    workspace.payments.map((payment) => [
      payment.id,
      payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
    ]),
  );
  for (const promise of workspace.promises) {
    if (promise.status === PromiseStatus.Cancelled) {
      continue;
    }
    const baseline = new Map(
      (promise.baselineAllocations ?? []).map((item) => [item.paymentId, item.amount]),
    );
    const paid = (paymentsByCustomer.get(promise.customerId) ?? [])
      .filter(
        (payment) =>
          payment.date >= today(new Date(promise.createdAt)) && payment.date <= promise.date,
      )
      .reduce(
        (sum, payment) =>
          sum +
          Math.max(0, (allocatedByPayment.get(payment.id) ?? 0) - (baseline.get(payment.id) ?? 0)),
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
  actorId = actor,
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
      const names = new Set(workspace.customers.map((item) => item.name.toLowerCase()));
      for (const customer of customers) {
        const name = customer.name.toLowerCase();
        if (names.has(name)) {
          throw new Error(`Customer ${customer.name} already exists. No rows were imported.`);
        }
        names.add(name);
        workspace.customers.push({ ...customer, id: crypto.randomUUID() });
      }
      detail = `${customers.length} customer account${customers.length === 1 ? '' : 's'} added${command.type === CommandType.ImportCustomers && command.sourceName ? ` from ${command.sourceName}` : ''}`;
      break;
    }
    case CommandType.UpdateCustomer: {
      const customer = workspace.customers.find((item) => item.id === command.customerId);
      if (!customer) {
        throw new Error('Customer is unavailable.');
      }
      if (
        workspace.customers.some(
          (item) =>
            item.id !== command.customerId &&
            item.name.toLowerCase() === command.customer.name.toLowerCase(),
        )
      ) {
        throw new Error('Another customer already has this name.');
      }
      const oldName = customer.name;
      Object.assign(customer, command.customer);
      detail = `${oldName}: customer details updated${customer.status === CustomerStatus.OnHold ? ' and account placed on hold' : ''}`;
      entityId = customer.id;
      break;
    }
    case CommandType.CreateInvoice:
    case CommandType.ImportInvoices: {
      const invoices =
        command.type === CommandType.CreateInvoice ? [command.invoice] : command.invoices;
      const customerIds = new Set(workspace.customers.map((item) => item.id));
      const numbers = new Set(workspace.invoices.map((item) => item.number.toLowerCase()));
      for (const invoice of invoices) {
        if (!customerIds.has(invoice.customerId)) {
          throw new Error('Customer does not belong to this workspace.');
        }
        if (invoice.issuedAt > date) {
          throw new Error('Invoice date cannot be in the future.');
        }
        const number = invoice.number.toLowerCase();
        if (numbers.has(number)) {
          throw new Error(`Invoice ${invoice.number} already exists. No rows were imported.`);
        }
        numbers.add(number);
        workspace.invoices.push({ ...invoice, id: crypto.randomUUID(), paid: 0 });
      }
      detail = `${invoices.length} invoice${invoices.length === 1 ? '' : 's'} created${command.type === CommandType.ImportInvoices && command.sourceName ? ` from ${command.sourceName}` : ''}`;
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
    case CommandType.AdjustInvoice:
    case CommandType.IssueCreditNote: {
      const invoice = workspace.invoices.find((item) => item.id === command.invoiceId);
      if (!invoice || invoice.status !== InvoiceStatus.Open) {
        throw new Error('Only open invoices can be corrected.');
      }

      const isCreditNote = command.type === CommandType.IssueCreditNote;
      const direction = isCreditNote ? InvoiceAdjustmentDirection.Decrease : command.direction;
      const nextAmount =
        invoice.amount +
        (direction === InvoiceAdjustmentDirection.Increase ? command.amount : -command.amount);

      if (
        !Number.isSafeInteger(nextAmount) ||
        nextAmount <= 0 ||
        nextAmount < invoice.paid ||
        nextAmount > FINANCE.maximumAmount
      ) {
        throw new Error('Correction would make the invoice amount invalid or less than paid.');
      }

      if (isCreditNote) {
        const duplicate = workspace.invoiceCorrections.some(
          (item) =>
            item.kind === InvoiceCorrectionKind.CreditNote &&
            item.number.toLowerCase() === command.number.toLowerCase(),
        );
        if (duplicate) {
          throw new Error('A credit note already uses this number.');
        }
      }

      invoice.amount = nextAmount;
      entityId = crypto.randomUUID();
      workspace.invoiceCorrections.unshift({
        id: entityId,
        invoiceId: invoice.id,
        kind: isCreditNote ? InvoiceCorrectionKind.CreditNote : InvoiceCorrectionKind.Adjustment,
        direction,
        amount: command.amount,
        number: isCreditNote ? command.number : '',
        reason: command.reason,
        createdAt: stamp,
        createdBy: actor,
      });
      detail = `${invoice.number}: ${isCreditNote ? `credit note ${command.number}` : 'invoice adjustment'} ${direction.toLowerCase()} Rs ${command.amount / 100}. ${command.reason}`;
      break;
    }
    case CommandType.RequestWriteOff: {
      const invoice = workspace.invoices.find((item) => item.id === command.invoiceId);
      if (!invoice || invoice.status !== InvoiceStatus.Open || balance(invoice) <= 0) {
        throw new Error('Only an open outstanding invoice can be submitted for write-off.');
      }
      if (
        workspace.writeOffRequests.some(
          (request) =>
            request.invoiceId === invoice.id && request.status === WriteOffStatus.Pending,
        )
      ) {
        throw new Error('A write-off request is already pending for this invoice.');
      }

      entityId = crypto.randomUUID();
      workspace.writeOffRequests.unshift({
        id: entityId,
        invoiceId: invoice.id,
        amount: balance(invoice),
        reason: command.reason,
        status: WriteOffStatus.Pending,
        requestedAt: stamp,
        requestedById: actorId,
        requestedBy: actor,
        reviewedAt: '',
        reviewedById: '',
        reviewedBy: '',
        reviewReason: '',
      });
      detail = `${invoice.number}: write-off requested for Rs ${balance(invoice) / 100}. ${command.reason}`;
      break;
    }
    case CommandType.ReviewWriteOff: {
      if (role !== Role.Owner && role !== Role.Admin) {
        throw new Error('Only an owner or administrator can review write-offs.');
      }
      const request = workspace.writeOffRequests.find((item) => item.id === command.requestId);
      if (!request || request.status !== WriteOffStatus.Pending) {
        throw new Error('Write-off request is not pending.');
      }
      if (request.requestedById === actorId) {
        throw new Error('A requester cannot approve or reject their own write-off.');
      }

      const invoice = workspace.invoices.find((item) => item.id === request.invoiceId);
      if (command.approved) {
        if (
          !invoice ||
          invoice.status !== InvoiceStatus.Open ||
          balance(invoice) !== request.amount
        ) {
          throw new Error('Invoice balance changed. Reject this request and submit a new one.');
        }

        invoice.status = InvoiceStatus.WrittenOff;
      }

      request.status = command.approved ? WriteOffStatus.Approved : WriteOffStatus.Rejected;
      request.reviewedAt = stamp;
      request.reviewedById = actorId;
      request.reviewedBy = actor;
      request.reviewReason = command.reason;
      detail = `${invoice?.number ?? 'Invoice'}: write-off ${command.approved ? 'approved' : 'rejected'}. ${command.reason}`;
      entityId = request.id;
      break;
    }
    case CommandType.RecordBankReconciliation: {
      const result = reconcileBankStatement(workspace, command);
      entityId = crypto.randomUUID();
      workspace.bankReconciliations.unshift({
        ...result,
        id: entityId,
        createdAt: stamp,
        createdBy: actor,
      });
      detail = `${command.bank}: ${result.matchedCount} statement credits matched and ${result.issues.length} exception${result.issues.length === 1 ? '' : 's'} recorded from ${command.sourceName}`;
      break;
    }
    case CommandType.CreatePayment:
    case CommandType.ImportPayments: {
      const payments =
        command.type === CommandType.CreatePayment ? [command.payment] : command.payments;
      const customerIds = new Set(workspace.customers.map((item) => item.id));
      const references = new Set(
        workspace.payments.map((item) => paymentReferenceKey(item.bank, item.reference)),
      );
      for (const payment of payments) {
        if (payment.customerId && !customerIds.has(payment.customerId)) {
          throw new Error('Customer does not belong to this workspace.');
        }
        if (payment.date > date) {
          throw new Error('Payment date cannot be in the future.');
        }
        const reference = paymentReferenceKey(payment.bank, payment.reference);
        if (references.has(reference)) {
          throw new Error(
            `Reference ${payment.reference} already exists for this bank. No rows were imported.`,
          );
        }
        references.add(reference);
        workspace.payments.push({
          ...payment,
          id: crypto.randomUUID(),
          allocations: [],
          status: PaymentStatus.Unmatched,
        });
      }
      detail = `${payments.length} payment${payments.length === 1 ? '' : 's'} added for review${command.type === CommandType.ImportPayments && command.sourceName ? ` from ${command.sourceName}` : ''}`;
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
