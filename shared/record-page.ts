import { z } from 'zod';
import { CollectionPriority } from './enums';
import { customerSchema, invoiceSchema, paymentSchema } from './schema';

export const recordPageSchema = z.object({
  items: z.array(z.union([customerSchema, invoiceSchema, paymentSchema])),
  nextCursor: z.number().int().nullable(),
  revision: z.number().int(),
  customerNames: z.record(z.string(), z.string()),
  customerSummaries: z.record(
    z.string(),
    z.object({
      outstanding: z.number(),
      overdue: z.number(),
      days: z.number(),
      broken: z.number(),
      utilization: z.number(),
      available: z.number(),
      score: z.number(),
      priority: z.enum(CollectionPriority),
    }),
  ),
});

export type RecordPageResponse = z.infer<typeof recordPageSchema>;
