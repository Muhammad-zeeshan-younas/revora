import type {
  CommunicationChannel,
  InteractionOutcome,
  MessageDirection,
  PaymentMethod,
  Role,
} from '../../../shared/enums';

/** Editable form values stay in rupees until the validated command boundary. */
export interface ActionForm {
  name: string;
  contact: string;
  email: string;
  phone: string;
  city: string;
  taxId: string;
  salesperson: string;
  creditLimit: string;
  terms: number;
  customerId: string;
  number: string;
  issuedAt: string;
  dueAt: string;
  amount: string;
  reference: string;
  bank: string;
  description: string;
  method: PaymentMethod;
  date: string;
  message: string;
  channel: CommunicationChannel;
  outcome: InteractionOutcome;
  direction: MessageDirection;
  nextAction: string;
  reason: string;
  role: Role;
  orderAmount: string;
}
