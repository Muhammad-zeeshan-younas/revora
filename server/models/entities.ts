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
import { CommandReceiptEntity } from './command-receipt.model';
import { PasswordResetEntity } from './password-reset.model';
import { BankImportProfileEntity } from './bank-import-profile.model';
import { WorkerLeaseEntity } from './worker-lease.model';
import { InvoiceCorrectionEntity } from './invoice-correction.model';
import { WriteOffRequestEntity } from './write-off-request.model';
import { BankReconciliationEntity } from './bank-reconciliation.model';
import { CustomerTerritoryEntity } from './customer-territory.model';
import { WhatsAppDeliveryEntity } from './whatsapp-delivery.model';
import { WhatsAppWebhookEventEntity } from './whatsapp-webhook-event.model';
import { WhatsAppStatusEventEntity } from './whatsapp-status-event.model';
import { WhatsAppConsentEntity } from './whatsapp-consent.model';
import { AttachmentEntity } from './attachment.model';
import { ManagementReportEntity } from './management-report.model';
import { UserMfaEntity } from './user-mfa.model';
import { EmailVerificationEntity } from './email-verification.model';
import { InventoryItemEntity } from './inventory-item.model';
import { SalesOrderEntity } from './sales-order.model';
import { SalesOrderLineEntity } from './sales-order-line.model';
import { WorkerRunEntity } from './worker-run.model';
import { SecurityEventEntity } from './security-event.model';

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
  CommandReceiptEntity,
  PasswordResetEntity,
  BankImportProfileEntity,
  WorkerLeaseEntity,
  InvoiceCorrectionEntity,
  WriteOffRequestEntity,
  BankReconciliationEntity,
  CustomerTerritoryEntity,
  WhatsAppDeliveryEntity,
  WhatsAppWebhookEventEntity,
  WhatsAppStatusEventEntity,
  WhatsAppConsentEntity,
  AttachmentEntity,
  ManagementReportEntity,
  UserMfaEntity,
  EmailVerificationEntity,
  InventoryItemEntity,
  SalesOrderEntity,
  SalesOrderLineEntity,
  WorkerRunEntity,
  SecurityEventEntity,
];
