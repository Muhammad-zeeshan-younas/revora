import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { allowed, applyCommand, refreshPromises } from '../../shared/domain';
import { bankImportProfileSchema } from '../../shared/csv';
import type { BankImportProfile } from '../../shared/csv';
import { CommandType, Role, WhatsAppDeliveryStatus } from '../../shared/enums';
import type { Mutation, Session, Snapshot, Workspace } from '../../shared/schema';
import { WorkspaceRepository } from '../repositories/workspace.repository';
import type { RecordPage } from '../repositories/workspace.repository';
import { RecordKind, recordQuerySchema, validRecordStatus } from '../../shared/record-query';
import { z } from 'zod';
import { WhatsAppDeliveryRepository } from '../repositories/whatsapp-delivery.repository';
import { OrderInventoryService } from './order-inventory.service';
import { balance } from '../../shared/finance';
import { aging, customerAccounts, metrics, operationsMetrics, today } from '../../shared/finance';
import { InvoiceStatus, PaymentStatus, PromiseStatus } from '../../shared/enums';
import type { OverviewProjection } from '../../shared/overview-projection';

const territoryAssignmentSchema = z.object({
  customerId: z.string().min(1).max(100),
  userId: z.string().max(100),
  revision: z.number().int().min(0),
});
const whatsAppConsentSchema = z.object({
  customerId: z.string().min(1).max(100),
  consented: z.boolean(),
  source: z.string().trim().min(5).max(500),
  revision: z.number().int().min(0),
});

function visibleWorkspace(
  workspace: Workspace,
  customerIds: Set<string>,
  userId: string,
): Workspace {
  const invoiceIds = new Set(
    workspace.invoices
      .filter((invoice) => customerIds.has(invoice.customerId))
      .map((invoice) => invoice.id),
  );

  return {
    ...workspace,
    customers: workspace.customers.filter((customer) => customerIds.has(customer.id)),
    invoices: workspace.invoices.filter((invoice) => customerIds.has(invoice.customerId)),
    invoiceCorrections: workspace.invoiceCorrections.filter((item) =>
      invoiceIds.has(item.invoiceId),
    ),
    writeOffRequests: workspace.writeOffRequests.filter((item) => invoiceIds.has(item.invoiceId)),
    bankReconciliations: [],
    payments: workspace.payments.filter((payment) => customerIds.has(payment.customerId)),
    promises: workspace.promises.filter((promise) => customerIds.has(promise.customerId)),
    interactions: workspace.interactions.filter((item) => customerIds.has(item.customerId)),
    jobs: workspace.jobs.filter((job) => customerIds.has(job.customerId)),
    audit: [],
    members: workspace.members.filter((member) => member.id === userId),
  };
}

@Injectable()
export class WorkspaceService {
  constructor(
    @Inject(WorkspaceRepository) private readonly workspaces: WorkspaceRepository,
    @Inject(WhatsAppDeliveryRepository) private readonly deliveries: WhatsAppDeliveryRepository,
    @Inject(OrderInventoryService) private readonly orders: OrderInventoryService,
  ) {}

  async overview(session: Session): Promise<OverviewProjection> {
    const { workspace } = await this.read(session);
    const currentMonth = today().slice(0, 7);
    const chart: OverviewProjection['chart'] = [];
    for (let index = 5; index >= 0; index--) {
      const date = new Date(`${currentMonth}-01T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() - index);
      const month = date.toISOString().slice(0, 7);
      chart.push({
        label: date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
        collected: workspace.payments
          .filter(
            (payment) =>
              payment.date.startsWith(month) && payment.status !== PaymentStatus.Reversed,
          )
          .reduce(
            (sum, payment) =>
              sum + payment.allocations.reduce((total, allocation) => total + allocation.amount, 0),
            0,
          ),
        invoiced: workspace.invoices
          .filter(
            (invoice) =>
              invoice.issuedAt.startsWith(month) &&
              invoice.status !== InvoiceStatus.Draft &&
              invoice.status !== InvoiceStatus.WrittenOff,
          )
          .reduce((sum, invoice) => sum + invoice.amount, 0),
      });
    }
    const pendingPromises = workspace.promises.filter(
      (promise) => promise.status === PromiseStatus.Pending,
    );

    return {
      customerCount: workspace.customers.length,
      openInvoiceCount: workspace.invoices.filter((invoice) => balance(invoice) > 0).length,
      unmatchedCount: workspace.payments.filter((payment) =>
        [PaymentStatus.Unmatched, PaymentStatus.Partial].includes(payment.status),
      ).length,
      pendingPromiseCount: pendingPromises.length,
      pendingPromiseAmount: pendingPromises.reduce((sum, promise) => sum + promise.amount, 0),
      numbers: metrics(workspace),
      operations: operationsMetrics(workspace),
      buckets: aging(workspace),
      chart,
      topCustomers: customerAccounts(workspace)
        .filter((customer) => customer.overdue > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
      recentAudit: workspace.audit.slice(0, 4),
    };
  }

  async whatsappDeliveries(session: Session): Promise<{
    configured: boolean;
    deliveries: {
      jobId: string;
      status: WhatsAppDeliveryStatus;
      lastError: string;
      updatedAt: string;
    }[];
  }> {
    const all = await this.deliveries.list(session.organizationId);
    const allowedIds =
      session.user.role === Role.Sales
        ? new Set((await this.read(session)).workspace.jobs.map((job) => job.id))
        : null;

    return {
      configured: process.env['WHATSAPP_ORGANIZATION_ID'] === session.organizationId,
      deliveries: all
        .filter((item) => !allowedIds || allowedIds.has(item.jobId))
        .map(({ jobId, status, lastError, updatedAt }) => ({
          jobId,
          status,
          lastError,
          updatedAt,
        })),
    };
  }

  async retryWhatsAppDelivery(session: Session, jobId: string): Promise<{ ok: boolean }> {
    if (!allowed(session.user.role, CommandType.QueueReminder)) {
      throw new ForbiddenException('Your role cannot retry customer reminders.');
    }
    await this.deliveries.retry(session.organizationId, jobId);

    return { ok: true };
  }

  async whatsAppConsents(session: Session): Promise<
    {
      customerId: string;
      source: string;
      recordedBy: string;
      recordedAt: string;
    }[]
  > {
    const consents = await this.deliveries.listConsents(session.organizationId);
    const allowedIds =
      session.user.role === Role.Sales
        ? new Set((await this.read(session)).workspace.customers.map((customer) => customer.id))
        : null;

    return consents
      .filter((item) => !allowedIds || allowedIds.has(item.customerId))
      .map(({ customerId, source, recordedBy, recordedAt }) => ({
        customerId,
        source,
        recordedBy,
        recordedAt,
      }));
  }

  async setWhatsAppConsent(
    session: Session,
    body: object,
  ): Promise<{ revision: number; consented: boolean }> {
    if (![Role.Owner, Role.Admin, Role.Collections].includes(session.user.role)) {
      throw new ForbiddenException('Your role cannot change WhatsApp consent.');
    }
    const input = whatsAppConsentSchema.parse(body);
    const revision = await this.deliveries.setConsent(
      session.organizationId,
      input.customerId,
      input.consented,
      input.source,
      input.revision,
      session.user.name,
    );

    return { revision, consented: input.consented };
  }

  private async snapshot(
    session: Session,
    workspace: Workspace,
    revision: number,
  ): Promise<Snapshot> {
    if (session.user.role !== Role.Sales) {
      return { workspace, revision, session };
    }
    const assignments = await this.workspaces.listCustomerTerritories(session.organizationId);
    const customerIds = new Set(
      Object.entries(assignments)
        .filter(([, userId]) => userId === session.user.id)
        .map(([customerId]) => customerId),
    );

    return {
      workspace: visibleWorkspace(workspace, customerIds, session.user.id),
      revision,
      session,
    };
  }

  async territories(session: Session): Promise<Record<string, string>> {
    if (session.user.role !== Role.Owner && session.user.role !== Role.Admin) {
      throw new ForbiddenException('Your role cannot view territory assignments.');
    }

    return this.workspaces.listCustomerTerritories(session.organizationId);
  }

  async assignTerritory(
    session: Session,
    body: object,
  ): Promise<{ assignments: Record<string, string>; revision: number }> {
    if (session.user.role !== Role.Owner && session.user.role !== Role.Admin) {
      throw new ForbiddenException('Your role cannot assign customer territories.');
    }
    const assignment = territoryAssignmentSchema.parse(body);
    const revision = await this.workspaces.assignCustomerTerritory(
      session.organizationId,
      assignment.customerId,
      assignment.userId,
      assignment.revision,
      session.user.name,
    );

    return { assignments: await this.territories(session), revision };
  }

  async records(session: Session, kindValue: string, rawQuery: object): Promise<RecordPage> {
    const kind = Object.values(RecordKind).find((item) => item === kindValue);
    if (!kind) {
      throw new BadRequestException('Unknown record type.');
    }
    const query = recordQuerySchema.parse(rawQuery);
    if (!validRecordStatus(kind, query.status)) {
      throw new BadRequestException('Unknown record status.');
    }

    return this.workspaces.listRecords(
      session.organizationId,
      kind,
      query,
      session.user.role === Role.Sales ? session.user.id : null,
    );
  }

  async bankImportProfiles(session: Session): Promise<BankImportProfile[]> {
    return this.workspaces.listBankImportProfiles(session.organizationId);
  }

  async saveBankImportProfile(session: Session, body: object): Promise<BankImportProfile[]> {
    if (!allowed(session.user.role, CommandType.ImportPayments)) {
      throw new ForbiddenException('Your role cannot save bank import profiles.');
    }
    const profile = bankImportProfileSchema.parse(body);
    await this.workspaces.saveBankImportProfile(session.organizationId, profile);

    return this.bankImportProfiles(session);
  }

  async read(session: Session): Promise<Snapshot> {
    const record = await this.workspaces.findById(session.organizationId);
    refreshPromises(record.data);

    return this.snapshot(session, record.data, record.revision);
  }

  async bootstrap(session: Session): Promise<Snapshot> {
    const record = await this.workspaces.bootstrap(
      session.organizationId,
      session.user.role === Role.Sales ? session.user.id : null,
    );

    return { workspace: record.data, revision: record.revision, session };
  }

  async execute(session: Session, mutation: Mutation): Promise<Snapshot> {
    const payloadHash = createHash('sha256')
      .update(JSON.stringify({ revision: mutation.revision, command: mutation.command }))
      .digest('hex');
    const replay = async (): Promise<Snapshot | null> => {
      if (!mutation.requestId) {
        return null;
      }
      const receipt = await this.workspaces.findReceipt(session.organizationId, mutation.requestId);
      if (!receipt) {
        return null;
      }
      if (receipt.payloadHash !== payloadHash) {
        throw new ConflictException('This request ID was already used for a different command.');
      }

      return this.read(session);
    };
    const previous = await replay();
    if (previous) {
      return previous;
    }
    if (mutation.command.type === CommandType.CancelReminder) {
      const delivery = await this.deliveries.find(session.organizationId, mutation.command.jobId);
      if (delivery && delivery.status !== WhatsAppDeliveryStatus.Failed) {
        throw new ConflictException('Delivery was already claimed. Its outcome must be reviewed.');
      }
    }
    const record = await this.workspaces.findById(session.organizationId);
    if (session.user.role === Role.Sales) {
      const customerId =
        mutation.command.type === CommandType.CreatePromise
          ? mutation.command.customerId
          : mutation.command.type === CommandType.CreateInteraction
            ? mutation.command.interaction.customerId
            : '';
      const assignments = await this.workspaces.listCustomerTerritories(session.organizationId);
      if (!customerId || assignments[customerId] !== session.user.id) {
        throw new ForbiddenException('This customer is outside your assigned territory.');
      }
    }
    if (mutation.revision !== record.revision) {
      const completed = await replay();
      if (completed) {
        return completed;
      }
      throw new ConflictException('Workspace changed. Refresh before trying again.');
    }
    let data = record.data;
    try {
      data = applyCommand(
        record.data,
        mutation.command,
        session.user.name,
        session.user.role,
        new Date(),
        session.user.id,
      );
      if (
        [
          CommandType.CreateInvoice,
          CommandType.ImportInvoices,
          CommandType.AdjustInvoice,
          CommandType.UpdateCredit,
        ].includes(mutation.command.type)
      ) {
        const holds = await this.orders.activeHolds(session.organizationId);
        for (const customer of data.customers) {
          const held = holds.get(customer.id) ?? 0;
          if (!held) {continue;}
          const outstanding = data.invoices
            .filter((invoice) => invoice.customerId === customer.id)
            .reduce((sum, invoice) => sum + balance(invoice), 0);
          if (outstanding + held > customer.creditLimit) {
            throw new Error(
              `${customer.name} has reserved orders. This change would exceed available credit.`,
            );
          }
        }
      }
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid operation.');
    }
    let revision: number;
    try {
      revision = await this.workspaces.save(
        record,
        data,
        mutation.requestId ? { requestId: mutation.requestId, payloadHash } : undefined,
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        const completed = await replay();
        if (completed) {
          return completed;
        }
      }
      throw error;
    }

    return this.snapshot(session, data, revision);
  }
}
