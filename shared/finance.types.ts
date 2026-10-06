import type { CollectionPriority } from './enums';

export interface AccountSummary {
  outstanding: number;
  overdue: number;
  days: number;
  broken: number;
  utilization: number;
  available: number;
  score: number;
  priority: CollectionPriority;
}

export interface ReceivablesMetrics {
  total: number;
  overdue: number;
  collected: number;
  averageDays: number;
}

export interface OperationsMetrics {
  unallocatedReceipts: number;
  unallocatedAmount: number;
  receiptsWaitingSevenDays: number;
  promisesDue: number;
  promisesKept: number;
}

export interface AgingBucket {
  label: string;
  amount: number;
  color: string;
}
