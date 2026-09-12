import type { PageId, ActionKind } from './config/ui.enums';
import type { ImportKind } from '../shared/csv';

export type Page = PageId;
export type Action =
  | { kind: ActionKind.Customer }
  | { kind: ActionKind.Invoice; customerId?: string }
  | { kind: ActionKind.Payment; customerId?: string }
  | { kind: ActionKind.Import; importKind: ImportKind }
  | { kind: ActionKind.Profile; customerId: string }
  | { kind: ActionKind.Interaction; customerId: string }
  | { kind: ActionKind.Promise; customerId: string }
  | { kind: ActionKind.Credit; customerId: string }
  | { kind: ActionKind.Match; paymentId: string }
  | { kind: ActionKind.Reverse; paymentId: string }
  | { kind: ActionKind.Dispute; invoiceId: string }
  | { kind: ActionKind.Invite }
  | { kind: ActionKind.Help };
