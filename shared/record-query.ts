import { z } from 'zod';
import { CustomerStatus, InvoiceStatus, PaymentStatus } from './enums';

export enum RecordKind {
  Customers = 'customers',
  Invoices = 'invoices',
  Payments = 'payments',
}

export const recordQuerySchema = z.object({
  cursor: z.coerce.number().int().min(-1).default(-1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(''),
  status: z.string().max(40).default(''),
});

export type RecordQuery = z.infer<typeof recordQuerySchema>;

export function validRecordStatus(kind: RecordKind, status: string): boolean {
  if (!status) {
    return true;
  }

  switch (kind) {
    case RecordKind.Customers:
      return (
        status === InvoiceStatus.Overdue ||
        Object.values(CustomerStatus).includes(status as CustomerStatus)
      );
    case RecordKind.Invoices:
      return Object.values(InvoiceStatus).includes(status as InvoiceStatus);
    case RecordKind.Payments:
      return Object.values(PaymentStatus).includes(status as PaymentStatus);
  }
}
