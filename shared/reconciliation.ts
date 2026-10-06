import { FINANCE } from './constants';
import { BankReconciliationIssueKind, PaymentStatus } from './enums';
import type { CommandType } from './enums';
import { today, toPaisa } from './finance';
import { paymentReferenceKey } from './payment-reference';
import type { BankReconciliation, Command, Workspace } from './schema';

type ReconciliationCommand = Extract<Command, { type: CommandType.RecordBankReconciliation }>;
export type ReconciliationResult = Omit<BankReconciliation, 'id' | 'createdAt' | 'createdBy'>;
type BankReconciliationResultIssue = BankReconciliation['issues'][number];

function bankKey(bank: string, reference: string): string {
  return paymentReferenceKey(bank.trim().toLowerCase(), reference.trim());
}

export function signedRupeesToPaisa(value: string): number {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const magnitude = toPaisa(negative ? trimmed.slice(1) : trimmed);

  return negative ? -magnitude : magnitude;
}

export function reconcileBankStatement(
  workspace: Workspace,
  command: ReconciliationCommand,
): ReconciliationResult {
  const entries = command.entries;
  const periodStart = entries.reduce(
    (earliest, entry) => (entry.date < earliest ? entry.date : earliest),
    entries[0]!.date,
  );
  const periodEnd = entries.reduce(
    (latest, entry) => (entry.date > latest ? entry.date : latest),
    entries[0]!.date,
  );
  const bankName = command.bank.trim().toLowerCase();
  const statementReferences = new Set<string>();
  const receiptReferences = new Set<string>();
  const issues: BankReconciliationResultIssue[] = [];
  const receipts = workspace.payments.filter(
    (payment) => payment.bank.trim().toLowerCase() === bankName,
  );
  const receiptByReference = new Map(
    receipts.map((payment) => [bankKey(payment.bank, payment.reference), payment]),
  );
  let creditTotal = 0;
  let debitTotal = 0;
  let matchedCount = 0;

  if (periodEnd > today()) {
    throw new Error('A bank statement cannot include future-dated entries.');
  }

  for (const entry of entries) {
    if (entry.bank.trim().toLowerCase() !== bankName) {
      throw new Error(`Row ${entry.rowNumber} belongs to another bank.`);
    }
    if (entry.credit > 0 === entry.debit > 0) {
      throw new Error(`Row ${entry.rowNumber} must have either a credit or a debit.`);
    }

    const reference = bankKey(entry.bank, entry.reference);
    if (statementReferences.has(reference)) {
      throw new Error(`Bank reference ${entry.reference} is repeated in this statement.`);
    }

    statementReferences.add(reference);
    creditTotal += entry.credit;
    debitTotal += entry.debit;

    if (entry.debit > 0) {
      continue;
    }

    receiptReferences.add(reference);
    const payment = receiptByReference.get(reference);
    if (!payment) {
      issues.push({
        kind: BankReconciliationIssueKind.MissingReceipt,
        reference: entry.reference,
        detail: `Statement credit of Rs ${entry.credit / FINANCE.paisaPerRupee} has no recorded receipt.`,
      });
      continue;
    }
    if (payment.status === PaymentStatus.Reversed) {
      issues.push({
        kind: BankReconciliationIssueKind.ReversedReceipt,
        reference: entry.reference,
        detail: 'The recorded receipt has been reversed.',
      });
      continue;
    }
    if (payment.amount !== entry.credit) {
      issues.push({
        kind: BankReconciliationIssueKind.AmountMismatch,
        reference: entry.reference,
        detail: `Statement Rs ${entry.credit / FINANCE.paisaPerRupee}; recorded receipt Rs ${payment.amount / FINANCE.paisaPerRupee}.`,
      });
      continue;
    }
    if (payment.date !== entry.date) {
      issues.push({
        kind: BankReconciliationIssueKind.DateMismatch,
        reference: entry.reference,
        detail: `Statement date ${entry.date}; recorded receipt date ${payment.date}.`,
      });
      continue;
    }

    matchedCount++;
    const allocated = payment.allocations.reduce((total, item) => total + item.amount, 0);
    if (allocated < payment.amount) {
      issues.push({
        kind: BankReconciliationIssueKind.UnallocatedReceipt,
        reference: entry.reference,
        detail: `Rs ${(payment.amount - allocated) / FINANCE.paisaPerRupee} is not allocated to invoices.`,
      });
    }
  }

  for (const payment of receipts) {
    const reference = bankKey(payment.bank, payment.reference);
    if (
      payment.date >= periodStart &&
      payment.date <= periodEnd &&
      payment.status !== PaymentStatus.Reversed &&
      !receiptReferences.has(reference)
    ) {
      issues.push({
        kind: BankReconciliationIssueKind.MissingStatementEntry,
        reference: payment.reference,
        detail: 'Recorded receipt is absent from the statement period.',
      });
    }
  }

  const balanceDifference =
    command.openingBalance + creditTotal - debitTotal - command.closingBalance;
  if (
    !Number.isSafeInteger(creditTotal) ||
    !Number.isSafeInteger(debitTotal) ||
    creditTotal > FINANCE.maximumAmount ||
    debitTotal > FINANCE.maximumAmount ||
    !Number.isSafeInteger(balanceDifference) ||
    Math.abs(balanceDifference) > FINANCE.maximumAmount
  ) {
    throw new Error('Statement totals exceed the supported amount.');
  }
  if (balanceDifference !== 0) {
    issues.push({
      kind: BankReconciliationIssueKind.StatementBalanceMismatch,
      reference: '',
      detail: `Opening balance plus credits less debits differs from the closing balance by Rs ${balanceDifference / FINANCE.paisaPerRupee}.`,
    });
  }

  return {
    bank: command.bank,
    periodStart,
    periodEnd,
    openingBalance: command.openingBalance,
    closingBalance: command.closingBalance,
    creditTotal,
    debitTotal,
    balanceDifference,
    matchedCount,
    issues,
    sourceName: command.sourceName,
  };
}
