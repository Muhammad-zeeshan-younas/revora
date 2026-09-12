import { OrganizationEntity } from './organization.model';
import { UserEntity } from './user.model';
import { SessionEntity } from './session.model';
import { InviteEntity } from './invitation.model';
import { MemberEntity } from './member.model';
import { WorkspaceSettingsEntity } from './workspace-settings.model';
import { CustomerEntity } from './customer.model';
import { InvoiceEntity } from './invoice.model';
import { PaymentEntity } from './payment.model';
import { PaymentAllocationEntity } from './payment-allocation.model';
import { PaymentPromiseEntity } from './payment-promise.model';
import { PromiseBaselineEntity } from './promise-baseline.model';
import { InteractionEntity } from './interaction.model';
import { ReminderJobEntity } from './reminder-job.model';
import { AuditEventEntity } from './audit-event.model';

export const entities = [
  OrganizationEntity,
  UserEntity,
  SessionEntity,
  InviteEntity,
  MemberEntity,
  WorkspaceSettingsEntity,
  CustomerEntity,
  InvoiceEntity,
  PaymentEntity,
  PaymentAllocationEntity,
  PaymentPromiseEntity,
  PromiseBaselineEntity,
  InteractionEntity,
  ReminderJobEntity,
  AuditEventEntity,
];
