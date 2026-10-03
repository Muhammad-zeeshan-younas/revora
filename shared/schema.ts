import {
  CommandType,
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
} from './enums';
import { z } from 'zod';
import { FINANCE, COLLECTIONS, SESSION } from './constants';

export const moneySchema = z.number().int().min(0).max(FINANCE.maximumAmount);
const positiveMoney = moneySchema.refine((value) => value > 0, 'Amount must be greater than zero');
export const dateSchema = z.iso.date();
const id = z.string().min(1).max(100);
const name = z.string().trim().min(2).max(120);
export const roleSchema = z.enum(Role);
export { Role } from './enums';
export const customerSchema = z.object({
  id,
  name,
  contact: name,
  email: z.email(),
  phone: z.string().regex(/^\+\d{10,15}$/),
  city: name,
  taxId: z.string().max(80),
  salesperson: name,
  creditLimit: moneySchema,
  terms: z.number().int().min(0).max(365),
  status: z.enum(CustomerStatus),
});
export type Customer = z.infer<typeof customerSchema>;
export const invoiceSchema = z.object({
  id,
  number: id,
  customerId: id,
  issuedAt: dateSchema,
  dueAt: dateSchema,
  amount: positiveMoney,
  paid: moneySchema,
  status: z.enum([
    InvoiceStatus.Open,
    InvoiceStatus.Disputed,
    InvoiceStatus.Draft,
    InvoiceStatus.WrittenOff,
  ]),
  reference: z.string().max(100),
});
export type Invoice = z.infer<typeof invoiceSchema>;
export const allocationSchema = z.object({ invoiceId: id, amount: positiveMoney });
export const paymentSchema = z.object({
  id,
  customerId: z.string(),
  amount: positiveMoney,
  date: dateSchema,
  reference: id,
  description: z.string().max(500),
  bank: name,
  method: z.enum(PaymentMethod),
  allocations: z.array(allocationSchema),
  status: z.enum(PaymentStatus),
});
export type Payment = z.infer<typeof paymentSchema>;
export const promiseSchema = z.object({
  id,
  customerId: id,
  amount: positiveMoney,
  date: dateSchema,
  createdAt: z.iso.datetime(),
  status: z.enum(PromiseStatus),
  note: z.string().max(2000),
  baselineAllocations: z.array(z.object({ paymentId: id, amount: moneySchema })).default([]),
});
export type PromiseToPay = z.infer<typeof promiseSchema>;
export const interactionSchema = z.object({
  id,
  customerId: id,
  at: z.iso.datetime(),
  author: name,
  channel: z.enum(CommunicationChannel),
  message: z.string().min(1).max(2000),
  outcome: z.enum(InteractionOutcome),
  nextAction: z.string().max(200),
  direction: z.enum(MessageDirection),
});
export type Interaction = z.infer<typeof interactionSchema>;
export const auditSchema = z.object({
  id,
  at: z.iso.datetime(),
  actor: name,
  action: z.string(),
  detail: z.string(),
  entityId: z.string(),
});
export const jobSchema = z.object({
  id,
  customerId: id,
  message: z.string(),
  scheduledAt: z.iso.datetime(),
  status: z.enum(ReminderStatus),
  createdBy: name,
});
export const memberSchema = z.object({ id, name, email: z.email(), role: roleSchema });
export const workspaceSchema = z.object({
  organization: z.object({
    id,
    name,
    currency: z.literal(FINANCE.currency),
    timezone: z.literal(FINANCE.timezone),
  }),
  customers: z.array(customerSchema),
  invoices: z.array(invoiceSchema),
  payments: z.array(paymentSchema),
  promises: z.array(promiseSchema),
  interactions: z.array(interactionSchema),
  audit: z.array(auditSchema),
  jobs: z.array(jobSchema),
  members: z.array(memberSchema),
  settings: z.object({
    remindersEnabled: z.boolean(),
    reminderHour: z
      .number()
      .int()
      .min(COLLECTIONS.earliestReminderHour)
      .max(COLLECTIONS.latestReminderHour),
    dailyLimit: z.number().int().min(1).max(100),
    template: z.string().min(20).max(1500),
  }),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export const sessionSchema = z.object({
  user: memberSchema,
  organizationId: id,
  demo: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;
export const snapshotSchema = z.object({
  workspace: workspaceSchema,
  revision: z.number().int(),
  session: sessionSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;

const customerInput = customerSchema.omit({ id: true });
const invoiceInput = invoiceSchema
  .omit({ id: true, paid: true })
  .refine((value) => value.dueAt >= value.issuedAt, 'Due date must follow invoice date');
const paymentInput = paymentSchema.omit({ id: true, allocations: true, status: true });
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(CommandType.CreateCustomer), customer: customerInput }),
  z.object({
    type: z.literal(CommandType.ImportCustomers),
    customers: z.array(customerInput).min(1).max(COLLECTIONS.maximumBatchRows),
  }),
  z.object({ type: z.literal(CommandType.CreateInvoice), invoice: invoiceInput }),
  z.object({
    type: z.literal(CommandType.ImportInvoices),
    invoices: z.array(invoiceInput).min(1).max(COLLECTIONS.maximumBatchRows),
  }),
  z.object({
    type: z.literal(CommandType.DisputeInvoice),
    invoiceId: id,
    disputed: z.boolean(),
    reason: z.string().min(5).max(500),
  }),
  z.object({ type: z.literal(CommandType.CreatePayment), payment: paymentInput }),
  z.object({
    type: z.literal(CommandType.ImportPayments),
    payments: z.array(paymentInput).min(1).max(COLLECTIONS.maximumBatchRows),
  }),
  z.object({
    type: z.literal(CommandType.AllocatePayment),
    paymentId: id,
    customerId: id,
    allocations: z.array(allocationSchema).min(1).max(100),
  }),
  z.object({
    type: z.literal(CommandType.ReversePayment),
    paymentId: id,
    reason: z.string().min(5).max(500),
  }),
  z.object({
    type: z.literal(CommandType.CreatePromise),
    customerId: id,
    amount: positiveMoney,
    date: dateSchema,
    note: z.string().max(2000),
  }),
  z.object({ type: z.literal(CommandType.CancelPromise), promiseId: id }),
  z.object({
    type: z.literal(CommandType.CreateInteraction),
    interaction: interactionSchema.omit({ id: true, at: true, author: true }),
  }),
  z.object({ type: z.literal(CommandType.QueueReminder), customerId: id }),
  z.object({ type: z.literal(CommandType.CancelReminder), jobId: id }),
  z.object({
    type: z.literal(CommandType.UpdateCredit),
    customerId: id,
    limit: moneySchema,
    reason: z.string().min(5).max(500),
  }),
  z.object({
    type: z.literal(CommandType.UpdateSettings),
    settings: workspaceSchema.shape.settings,
  }),
  z.object({ type: z.literal(CommandType.UpdateMemberRole), memberId: id, role: roleSchema }),
]);
export type Command = z.infer<typeof commandSchema>;
export const mutationSchema = z.object({
  revision: z.number().int().min(0),
  command: commandSchema,
});
export type Mutation = z.infer<typeof mutationSchema>;
export const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(128) });
export const createCompanySchema = loginSchema.extend({
  password: z.string().min(SESSION.minimumPasswordLength).max(128),
  name,
  organization: name,
});
export const inviteSchema = z.object({ email: z.email(), role: roleSchema.exclude([Role.Owner]) });
export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  name,
  password: z.string().min(SESSION.minimumPasswordLength).max(128),
});
export const inviteResultSchema = z.object({ link: z.string(), expiresAt: z.iso.datetime() });
export const errorSchema = z.object({ message: z.union([z.string(), z.array(z.string())]) });
