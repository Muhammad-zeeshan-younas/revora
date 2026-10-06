import type { Action } from '../types';

interface DialogCopy {
  title: string;
  submitLabel: string;
}

export const dialogCopy: Record<Action['kind'], DialogCopy> = {
  customer: { title: 'A new business relationship', submitLabel: 'Save customer' },
  editCustomer: { title: 'Edit customer account', submitLabel: 'Save changes' },
  invoice: { title: 'Create an invoice', submitLabel: 'Save invoice' },
  payment: { title: 'Record an incoming payment', submitLabel: 'Save payment' },
  import: { title: 'Import records', submitLabel: 'Import records' },
  profile: { title: 'Customer account', submitLabel: 'Done' },
  interaction: { title: 'Keep the conversation connected', submitLabel: 'Save interaction' },
  promise: { title: 'Record a payment promise', submitLabel: 'Save promise' },
  credit: { title: 'Review customer credit', submitLabel: 'Approve credit limit' },
  match: { title: 'Make the right connection', submitLabel: 'Approve allocation' },
  reverse: { title: 'Reverse payment allocations', submitLabel: 'Reverse allocations' },
  dispute: { title: 'Record an invoice dispute', submitLabel: 'Save decision' },
  invoiceCorrection: { title: 'Invoice corrections', submitLabel: 'Save correction' },
  bankReconciliation: { title: 'Bank reconciliation', submitLabel: 'Save reconciliation' },
  attachments: { title: 'Supporting documents', submitLabel: 'Attach file' },
  managementReport: { title: 'Management report', submitLabel: 'Export report' },
  invite: { title: 'Better business, together', submitLabel: 'Create invitation link' },
  help: { title: 'A clear path to getting started', submitLabel: 'Done' },
};
