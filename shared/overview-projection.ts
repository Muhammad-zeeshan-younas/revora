import { z } from 'zod';
import { auditSchema, customerSchema } from './schema';

export const overviewProjectionSchema = z.object({
  customerCount: z.number().int().min(0),
  openInvoiceCount: z.number().int().min(0),
  unmatchedCount: z.number().int().min(0),
  pendingPromiseCount: z.number().int().min(0),
  pendingPromiseAmount: z.number().int().min(0),
  numbers: z.object({
    total: z.number(),
    overdue: z.number(),
    collected: z.number(),
    averageDays: z.number(),
  }),
  operations: z.object({
    unallocatedReceipts: z.number(),
    unallocatedAmount: z.number(),
    receiptsWaitingSevenDays: z.number(),
    promisesDue: z.number(),
    promisesKept: z.number(),
  }),
  buckets: z.array(z.object({ label: z.string(), amount: z.number(), color: z.string() })),
  chart: z.array(z.object({ label: z.string(), collected: z.number(), invoiced: z.number() })),
  topCustomers: z.array(
    customerSchema.extend({
      outstanding: z.number(),
      overdue: z.number(),
      days: z.number(),
      broken: z.number(),
      utilization: z.number(),
      available: z.number(),
      score: z.number(),
      priority: z.string(),
    }),
  ),
  recentAudit: z.array(auditSchema),
});

export type OverviewProjection = z.infer<typeof overviewProjectionSchema>;
