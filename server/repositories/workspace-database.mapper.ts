import { isDeepStrictEqual } from 'node:util';
import type { EntityManager, EntitySchema } from 'typeorm';
import { workspaceSchema } from '../../shared/schema';
import type { Workspace } from '../../shared/schema';
import type { WorkspaceRecord } from '../interfaces/workspace-record.interface';
import { OrganizationEntity } from '../models/organization.model';
import { UserEntity } from '../models/user.model';
import { MemberEntity } from '../models/member.model';
import { WorkspaceSettingsEntity } from '../models/workspace-settings.model';
import { CustomerEntity } from '../models/customer.model';
import { InvoiceEntity } from '../models/invoice.model';
import { PaymentEntity } from '../models/payment.model';
import { PaymentAllocationEntity } from '../models/payment-allocation.model';
import { PaymentPromiseEntity } from '../models/payment-promise.model';
import { PromiseBaselineEntity } from '../models/promise-baseline.model';
import { InteractionEntity } from '../models/interaction.model';
import { ReminderJobEntity } from '../models/reminder-job.model';
import { AuditEventEntity } from '../models/audit-event.model';

/** Reads database rows and maps them into the workspace object used by the application. */
export async function loadWorkspaceFromDatabase(
  manager: EntityManager,
  id: string,
): Promise<WorkspaceRecord | null> {
  const organization = await manager.getRepository(OrganizationEntity).findOneBy({ id });
  if (!organization) {
    return null;
  }
  const where = { organizationId: id };
  const order = { sortOrder: 'ASC' } as const;
  const [
    settings,
    customers,
    invoices,
    payments,
    allocations,
    promises,
    baselines,
    interactions,
    jobs,
    audit,
    members,
    users,
  ] = await Promise.all([
    manager.getRepository(WorkspaceSettingsEntity).findOneBy(where),
    manager.getRepository(CustomerEntity).find({ where, order }),
    manager.getRepository(InvoiceEntity).find({ where, order }),
    manager.getRepository(PaymentEntity).find({ where, order }),
    manager.getRepository(PaymentAllocationEntity).find({ where, order }),
    manager.getRepository(PaymentPromiseEntity).find({ where, order }),
    manager.getRepository(PromiseBaselineEntity).find({ where, order }),
    manager.getRepository(InteractionEntity).find({ where, order }),
    manager.getRepository(ReminderJobEntity).find({ where, order }),
    manager.getRepository(AuditEventEntity).find({ where, order }),
    manager.getRepository(MemberEntity).find({ where, order }),
    manager.getRepository(UserEntity).findBy(where),
  ]);
  const data = workspaceSchema.parse({
    organization,
    settings,
    customers,
    invoices,
    payments: payments.map((payment) => ({
      ...payment,
      customerId: payment.customerId ?? '',
      allocations: allocations.filter((allocation) => allocation.paymentId === payment.id),
    })),
    promises: promises.map((promise) => ({
      ...promise,
      baselineAllocations: baselines.filter((baseline) => baseline.promiseId === promise.id),
    })),
    interactions,
    jobs,
    audit,
    members: members.map((member) => {
      const user = users.find((candidate) => candidate.id === member.userId);
      if (!user) {
        throw new Error('Membership references an unavailable user.');
      }

      return { id: user.id, name: user.name, email: user.email, role: member.role };
    }),
  });

  return { id: organization.id, revision: organization.revision, data };
}

async function synchronizeRows<T extends { organizationId: string }>(
  manager: EntityManager,
  entity: EntitySchema<T>,
  organizationId: string,
  rows: T[],
  key: (row: T) => string,
): Promise<void> {
  const repository = manager.getRepository(entity);
  const existing = await repository
    .createQueryBuilder('record')
    .where('record.organizationId = :organizationId', { organizationId })
    .getMany();
  const previous = new Map(existing.map((row) => [key(row), row]));
  const next = new Set(rows.map(key));
  if (next.size !== rows.length || existing.some((row) => !next.has(key(row)))) {
    throw new Error(
      `Duplicate or removed ${entity.options.tableName} records require an explicit ledger operation.`,
    );
  }
  const changed = rows.filter((row) => !isDeepStrictEqual(previous.get(key(row)), row));
  if (changed.length > 0) {
    await repository.save(changed, { chunk: 100 });
  }
}

/**
 * Maps the updated workspace into table rows and saves changes to the database.
 * Runs inside the caller's transaction, after its organization revision check.
 */
export async function saveWorkspaceToDatabase(
  manager: EntityManager,
  workspace: Workspace,
): Promise<void> {
  const organizationId = workspace.organization.id;
  await synchronizeRows(
    manager,
    WorkspaceSettingsEntity,
    organizationId,
    [{ ...workspace.settings, organizationId }],
    (row) => row.organizationId,
  );
  await synchronizeRows(
    manager,
    MemberEntity,
    organizationId,
    workspace.members.map((member, sortOrder) => ({
      organizationId,
      userId: member.id,
      role: member.role,
      sortOrder,
    })),
    (row) => row.userId,
  );
  await synchronizeRows(
    manager,
    CustomerEntity,
    organizationId,
    workspace.customers.map((customer, sortOrder) => ({
      ...customer,
      organizationId,
      sortOrder,
      nameKey: customer.name.toLowerCase(),
    })),
    (row) => row.id,
  );
  await synchronizeRows(
    manager,
    InvoiceEntity,
    organizationId,
    workspace.invoices.map((invoice, sortOrder) => ({
      ...invoice,
      organizationId,
      sortOrder,
      numberKey: invoice.number.toLowerCase(),
    })),
    (row) => row.id,
  );
  await synchronizeRows(
    manager,
    PaymentEntity,
    organizationId,
    workspace.payments.map((payment, sortOrder) => ({
      id: payment.id,
      amount: payment.amount,
      date: payment.date,
      reference: payment.reference,
      description: payment.description,
      bank: payment.bank,
      method: payment.method,
      status: payment.status,
      organizationId,
      sortOrder,
      customerId: payment.customerId || null,
      referenceKey: payment.reference.toLowerCase(),
    })),
    (row) => row.id,
  );
  await synchronizeRows(
    manager,
    PaymentAllocationEntity,
    organizationId,
    workspace.payments.flatMap((payment) =>
      payment.allocations.map((allocation, sortOrder) => ({
        ...allocation,
        organizationId,
        paymentId: payment.id,
        customerId: payment.customerId,
        sortOrder,
      })),
    ),
    (row) => `${row.paymentId}:${row.sortOrder}`,
  );
  await synchronizeRows(
    manager,
    PaymentPromiseEntity,
    organizationId,
    workspace.promises.map((promise, sortOrder) => ({
      id: promise.id,
      customerId: promise.customerId,
      amount: promise.amount,
      date: promise.date,
      createdAt: promise.createdAt,
      status: promise.status,
      note: promise.note,
      organizationId,
      sortOrder,
    })),
    (row) => row.id,
  );
  await synchronizeRows(
    manager,
    PromiseBaselineEntity,
    organizationId,
    workspace.promises.flatMap((promise) =>
      promise.baselineAllocations.map((baseline, sortOrder) => ({
        ...baseline,
        organizationId,
        promiseId: promise.id,
        customerId: promise.customerId,
        sortOrder,
      })),
    ),
    (row) => `${row.promiseId}:${row.paymentId}`,
  );
  await synchronizeRows(
    manager,
    InteractionEntity,
    organizationId,
    workspace.interactions.map((interaction, sortOrder) => ({
      ...interaction,
      organizationId,
      sortOrder,
    })),
    (row) => row.id,
  );
  await synchronizeRows(
    manager,
    ReminderJobEntity,
    organizationId,
    workspace.jobs.map((job, sortOrder) => ({ ...job, organizationId, sortOrder })),
    (row) => row.id,
  );
  await synchronizeRows(
    manager,
    AuditEventEntity,
    organizationId,
    workspace.audit.map((event, sortOrder) => ({ ...event, organizationId, sortOrder })),
    (row) => row.id,
  );
}
