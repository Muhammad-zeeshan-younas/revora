/** Persisted values are stable API contracts. Change labels without changing these values. */
export enum Role {
  Owner = 'Owner',
  Admin = 'Admin',
  Accountant = 'Accountant',
  Collections = 'Collections',
  Sales = 'Sales',
  Viewer = 'Viewer',
}

export enum CustomerStatus {
  Active = 'Active',
  OnHold = 'On hold',
}

export enum InvoiceStatus {
  Draft = 'Draft',
  Open = 'Open',
  PartiallyPaid = 'Partially paid',
  Paid = 'Paid',
  Overdue = 'Overdue',
  Disputed = 'Disputed',
  WrittenOff = 'Written off',
}

export enum InvoiceCorrectionKind {
  Adjustment = 'Adjustment',
  CreditNote = 'Credit note',
}

export enum InvoiceAdjustmentDirection {
  Increase = 'Increase',
  Decrease = 'Decrease',
}

export enum WriteOffStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export enum PaymentStatus {
  Unmatched = 'Unmatched',
  Partial = 'Partial',
  Matched = 'Matched',
  Reversed = 'Reversed',
}

export enum PaymentMethod {
  BankTransfer = 'Bank transfer',
  Raast = 'Raast',
  Cash = 'Cash',
  Cheque = 'Cheque',
  Card = 'Card',
  Other = 'Other',
}

export enum PromiseStatus {
  Pending = 'Pending',
  Kept = 'Kept',
  PartiallyKept = 'Partially kept',
  Broken = 'Broken',
  Cancelled = 'Cancelled',
}

export enum ReminderStatus {
  Queued = 'Queued',
  Prepared = 'Prepared',
  Cancelled = 'Cancelled',
}

export enum WhatsAppDeliveryStatus {
  RetryReady = 'retry ready',
  Sending = 'sending',
  Accepted = 'accepted',
  Sent = 'sent',
  Delivered = 'delivered',
  Read = 'read',
  Failed = 'failed',
  Unknown = 'unknown',
}

export enum CommunicationChannel {
  WhatsApp = 'WhatsApp',
  Phone = 'Phone',
  Email = 'Email',
  Visit = 'Visit',
  InternalNote = 'Internal note',
}

export enum InteractionOutcome {
  NoResponse = 'No response',
  WillPay = 'Will pay',
  PartialPayment = 'Partial payment',
  Dispute = 'Dispute',
  PaymentAlreadySent = 'Payment already sent',
  NeedsInvoiceCopy = 'Needs invoice copy',
  EscalationRequired = 'Escalation required',
  Note = 'Note',
}

export enum MessageDirection {
  Inbound = 'Inbound',
  Outbound = 'Outbound',
  Internal = 'Internal',
}

export enum ReplyCategory {
  PromiseToPay = 'Promise to pay',
  PaymentConfirmation = 'Payment confirmation',
  Dispute = 'Dispute',
  InvoiceRequest = 'Invoice request',
  GeneralQuestion = 'General question',
}

export enum CollectionPriority {
  Critical = 'Critical',
  High = 'High',
  Normal = 'Normal',
}

export enum CommandType {
  CreateCustomer = 'customer.create',
  UpdateCustomer = 'customer.update',
  ImportCustomers = 'customers.import',
  CreateInvoice = 'invoice.create',
  ImportInvoices = 'invoices.import',
  DisputeInvoice = 'invoice.dispute',
  AdjustInvoice = 'invoice.adjust',
  IssueCreditNote = 'invoice.creditNote',
  RequestWriteOff = 'invoice.writeOff.request',
  ReviewWriteOff = 'invoice.writeOff.review',
  RecordBankReconciliation = 'bank.reconcile',
  CreatePayment = 'payment.create',
  ImportPayments = 'payments.import',
  AllocatePayment = 'payment.allocate',
  ReversePayment = 'payment.reverse',
  CreatePromise = 'promise.create',
  CancelPromise = 'promise.cancel',
  CreateInteraction = 'interaction.create',
  QueueReminder = 'reminder.queue',
  CancelReminder = 'reminder.cancel',
  UpdateCredit = 'credit.update',
  UpdateSettings = 'settings.update',
  UpdateMemberRole = 'member.role',
}

export enum AuditEvent {
  ReminderPrepared = 'reminder.prepared',
  MemberInvited = 'member.invite',
  StockUpdated = 'inventory.updated',
  OrderReserved = 'order.reserved',
  OrderCancelled = 'order.cancelled',
  OrderFulfilled = 'order.fulfilled',
}

export enum ImportKind {
  Customers = 'customers',
  Invoices = 'invoices',
  Payments = 'payments',
}

export enum BankDateFormat {
  Iso = 'iso',
  DayMonthYear = 'dmy',
}

export enum ImportReviewStatus {
  Ready = 'ready',
  Skipped = 'skipped',
  Error = 'error',
}

export enum BankReconciliationIssueKind {
  MissingReceipt = 'Missing receipt',
  MissingStatementEntry = 'Missing statement entry',
  AmountMismatch = 'Amount mismatch',
  DateMismatch = 'Date mismatch',
  ReversedReceipt = 'Reversed receipt',
  UnallocatedReceipt = 'Unallocated receipt',
  StatementBalanceMismatch = 'Statement balance mismatch',
}
export enum AttachmentTarget {
  Customer = 'customer',
  Invoice = 'invoice',
  Payment = 'payment',
}

export enum OrderStatus {
  Reserved = 'Reserved',
  Fulfilled = 'Fulfilled',
  Cancelled = 'Cancelled',
}
