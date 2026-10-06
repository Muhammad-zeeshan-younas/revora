import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Workspace } from '../../shared/schema';
import { DatabaseService } from '../services/database.service';
import { OrganizationEntity } from '../models/organization.model';
import { CommandReceiptEntity } from '../models/command-receipt.model';
import type { CommandReceiptRecord } from '../models/command-receipt.model';
import { WorkspaceSettingsEntity } from '../models/workspace-settings.model';
import { ReminderJobEntity } from '../models/reminder-job.model';
import {
  CollectionPriority,
  InvoiceStatus,
  PromiseStatus,
  ReminderStatus,
  Role,
} from '../../shared/enums';
import { today } from '../../shared/finance';
import { overdueDays } from '../../shared/finance';
import { In, LessThanOrEqual } from 'typeorm';
import { BankImportProfileEntity } from '../models/bank-import-profile.model';
import { WorkerLeaseEntity } from '../models/worker-lease.model';
import { CustomerEntity } from '../models/customer.model';
import { InvoiceEntity } from '../models/invoice.model';
import { PaymentEntity } from '../models/payment.model';
import { PaymentAllocationEntity } from '../models/payment-allocation.model';
import { CustomerTerritoryEntity } from '../models/customer-territory.model';
import { PaymentPromiseEntity } from '../models/payment-promise.model';
import { MemberEntity } from '../models/member.model';
import { UserEntity } from '../models/user.model';
import { AuditEventEntity } from '../models/audit-event.model';
import { RecordKind } from '../../shared/record-query';
import type { RecordQuery } from '../../shared/record-query';
import type { Customer, Invoice, Payment } from '../../shared/schema';
import { customerSchema, invoiceSchema, workspaceSchema } from '../../shared/schema';
import type { BankImportProfile } from '../../shared/csv';
import { bankImportProfileSchema } from '../../shared/csv';
import type { WorkspaceRecord } from '../interfaces/workspace-record.interface';
import { loadWorkspaceFromDatabase, saveWorkspaceToDatabase } from './workspace-database.mapper';

const SEARCH_WILDCARD_PATTERN = /[!%_]/g;

export interface RecordPage {
  items: (Customer | Invoice | Payment)[];
  nextCursor: number | null;
  revision: number;
  customerNames: Record<string, string>;
  customerSummaries: Record<
    string,
    {
      outstanding: number;
      overdue: number;
      days: number;
      broken: number;
      utilization: number;
      available: number;
      score: number;
      priority: CollectionPriority;
    }
  >;
}

function searchPattern(value: string): string {
  return `%${value.toLowerCase().replaceAll(SEARCH_WILDCARD_PATTERN, '!$&')}%`;
}

function pageResult<T extends { sortOrder: number }>(
  rows: T[],
  limit: number,
  revision: number,
  map: (row: T) => Customer | Invoice | Payment,
): RecordPage {
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  return {
    items: page.map(map),
    nextCursor: hasMore ? page.at(-1)!.sortOrder : null,
    revision,
    customerNames: {},
    customerSummaries: {},
  };
}

@Injectable()
export class WorkspaceRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async bootstrap(
    organizationId: string,
    memberId: string | null,
  ): Promise<{ data: Workspace; revision: number }> {
    return this.database.transaction(async (manager) => {
      const organization = await manager
        .getRepository(OrganizationEntity)
        .findOneBy({ id: organizationId });
      const settings = await manager
        .getRepository(WorkspaceSettingsEntity)
        .findOneBy({ organizationId });
      if (!organization || !settings) {throw new ConflictException('Workspace is unavailable.');}
      const memberships = await manager.getRepository(MemberEntity).find({
        where: { organizationId, ...(memberId ? { userId: memberId } : {}) },
        order: { sortOrder: 'ASC' },
      });
      const users = memberships.length
        ? await manager
            .getRepository(UserEntity)
            .findBy({ id: In(memberships.map((row) => row.userId)) })
        : [];
      const usersById = new Map(users.map((user) => [user.id, user]));

      return {
        revision: organization.revision,
        data: workspaceSchema.parse({
          organization: {
            id: organization.id,
            name: organization.name,
            currency: organization.currency,
            timezone: organization.timezone,
          },
          customers: [],
          invoices: [],
          invoiceCorrections: [],
          writeOffRequests: [],
          bankReconciliations: [],
          payments: [],
          promises: [],
          interactions: [],
          audit: [],
          jobs: [],
          members: memberships.flatMap((member) => {
            const user = usersById.get(member.userId);

            return user
              ? [{ id: user.id, name: user.name, email: user.email, role: member.role }]
              : [];
          }),
          settings: {
            remindersEnabled: settings.remindersEnabled,
            reminderHour: settings.reminderHour,
            dailyLimit: settings.dailyLimit,
            template: settings.template,
          },
        }),
      };
    }, true);
  }

  async listCustomerTerritories(organizationId: string): Promise<Record<string, string>> {
    return this.database.transaction(async (manager) => {
      const rows = await manager.getRepository(CustomerTerritoryEntity).findBy({ organizationId });

      return Object.fromEntries(rows.map((row) => [row.customerId, row.userId]));
    }, true);
  }

  async assignCustomerTerritory(
    organizationId: string,
    customerId: string,
    userId: string,
    revision: number,
    actor: string,
  ): Promise<number> {
    return this.database.transaction(async (manager) => {
      const customer = await manager.getRepository(CustomerEntity).findOneBy({
        organizationId,
        id: customerId,
      });
      if (!customer) {
        throw new BadRequestException('Customer does not belong to this company.');
      }
      const result = await manager
        .getRepository(OrganizationEntity)
        .update({ id: organizationId, revision }, { revision: revision + 1 });
      if (result.affected !== 1) {
        throw new ConflictException('Workspace changed. Refresh before assigning the customer.');
      }
      if (userId) {
        const member = await manager.getRepository(MemberEntity).findOneBy({
          organizationId,
          userId,
        });
        if (member?.role !== Role.Sales) {
          throw new BadRequestException('Assign a member with the Sales role.');
        }
        await manager
          .getRepository(CustomerTerritoryEntity)
          .upsert({ organizationId, customerId, userId }, ['organizationId', 'customerId']);
      } else {
        await manager.getRepository(CustomerTerritoryEntity).delete({ organizationId, customerId });
      }

      const minimum = await manager
        .getRepository(AuditEventEntity)
        .createQueryBuilder('event')
        .select('MIN(event.sortOrder)', 'minimum')
        .where('event.organizationId = :organizationId', { organizationId })
        .getRawOne<{ minimum: number | null }>();
      await manager.getRepository(AuditEventEntity).insert({
        id: crypto.randomUUID(),
        organizationId,
        sortOrder: (minimum?.minimum ?? 0) - 1,
        at: new Date().toISOString(),
        actor,
        action: 'territory.assign',
        detail: userId
          ? `${customer.name} assigned to salesperson ${userId}`
          : `${customer.name} unassigned`,
        entityId: customerId,
      });

      return revision + 1;
    });
  }

  async listRecords(
    organizationId: string,
    kind: RecordKind,
    query: RecordQuery,
    salespersonId: string | null = null,
  ): Promise<RecordPage> {
    return this.database.transaction(async (manager) => {
      const organization = await manager.getRepository(OrganizationEntity).findOneBy({
        id: organizationId,
      });
      if (!organization) {
        throw new ConflictException('Workspace is unavailable.');
      }

      const parameters = {
        organizationId,
        cursor: query.cursor,
        search: searchPattern(query.search),
        status: query.status,
      };
      const amount = query.limit + 1;

      if (kind === RecordKind.Customers) {
        const builder = manager
          .getRepository(CustomerEntity)
          .createQueryBuilder('record')
          .where('record.organizationId = :organizationId', parameters)
          .andWhere('record.sortOrder > :cursor', parameters)
          .orderBy('record.sortOrder', 'ASC')
          .take(amount);
        if (query.search) {
          builder.andWhere(
            "(LOWER(record.name) LIKE :search ESCAPE '!' OR LOWER(record.city) LIKE :search ESCAPE '!' OR LOWER(record.contact) LIKE :search ESCAPE '!')",
            parameters,
          );
        }
        if (query.status) {
          if (query.status === InvoiceStatus.Overdue) {
            builder.andWhere(
              'EXISTS (SELECT 1 FROM invoices overdue WHERE overdue.organizationId = record.organizationId AND overdue.customerId = record.id AND overdue.status NOT IN (:...excluded) AND overdue.amount > overdue.paid AND overdue.dueAt < :today)',
              { excluded: [InvoiceStatus.Draft, InvoiceStatus.WrittenOff], today: today() },
            );
          } else {
            builder.andWhere('record.status = :status', parameters);
          }
        }
        if (salespersonId) {
          builder.innerJoin(
            'customer_territories',
            'territory',
            'territory.organizationId = record.organizationId AND territory.customerId = record.id AND territory.userId = :salespersonId',
            { salespersonId },
          );
        }

        const rows = await builder.getMany();
        const result = pageResult(rows, query.limit, organization.revision, (row) =>
          customerSchema.parse(row),
        );
        const customers = rows.slice(0, query.limit);
        const ids = customers.map((customer) => customer.id);
        if (!ids.length) {return result;}
        const invoiceTotals = await manager
          .getRepository(InvoiceEntity)
          .createQueryBuilder('invoice')
          .select('invoice.customerId', 'customerId')
          .addSelect(
            'SUM(CASE WHEN invoice.status IN (:...excluded) THEN 0 ELSE invoice.amount - invoice.paid END)',
            'outstanding',
          )
          .addSelect(
            'SUM(CASE WHEN invoice.status IN (:...excluded) OR invoice.dueAt >= :date THEN 0 ELSE invoice.amount - invoice.paid END)',
            'overdue',
          )
          .addSelect(
            'MIN(CASE WHEN invoice.status IN (:...excluded) OR invoice.amount <= invoice.paid THEN NULL ELSE invoice.dueAt END)',
            'oldestDueAt',
          )
          .where('invoice.organizationId = :organizationId AND invoice.customerId IN (:...ids)', {
            organizationId,
            ids,
            excluded: [InvoiceStatus.Draft, InvoiceStatus.WrittenOff],
            date: today(),
          })
          .groupBy('invoice.customerId')
          .getRawMany<{
            customerId: string;
            outstanding: string | number;
            overdue: string | number;
            oldestDueAt: string | null;
          }>();
        const brokenPromises = await manager
          .getRepository(PaymentPromiseEntity)
          .createQueryBuilder('promise')
          .select('promise.customerId', 'customerId')
          .addSelect('COUNT(*)', 'count')
          .where(
            'promise.organizationId = :organizationId AND promise.customerId IN (:...ids) AND promise.status = :status',
            { organizationId, ids, status: PromiseStatus.Broken },
          )
          .groupBy('promise.customerId')
          .getRawMany<{ customerId: string; count: string | number }>();
        const invoiceByCustomer = new Map(invoiceTotals.map((row) => [row.customerId, row]));
        const brokenByCustomer = new Map(
          brokenPromises.map((row) => [row.customerId, Number(row.count)]),
        );
        for (const customer of customers) {
          const totals = invoiceByCustomer.get(customer.id);
          const outstanding = Number(totals?.outstanding ?? 0);
          const overdue = Number(totals?.overdue ?? 0);
          const days = totals?.oldestDueAt ? overdueDays({ dueAt: totals.oldestDueAt }) : 0;
          const broken = brokenByCustomer.get(customer.id) ?? 0;
          const utilization =
            customer.creditLimit > 0
              ? (outstanding / customer.creditLimit) * 100
              : outstanding > 0
                ? 100
                : 0;
          const score = Math.min(
            100,
            Math.round(
              days * 0.7 + overdue / 5_000_000 + broken * 15 + (utilization > 90 ? 15 : 0),
            ),
          );
          result.customerSummaries[customer.id] = {
            outstanding,
            overdue,
            days,
            broken,
            utilization,
            available: customer.creditLimit - outstanding,
            score,
            priority:
              score >= 65
                ? CollectionPriority.Critical
                : score >= 35
                  ? CollectionPriority.High
                  : CollectionPriority.Normal,
          };
        }

        return result;
      }

      if (kind === RecordKind.Invoices) {
        const builder = manager
          .getRepository(InvoiceEntity)
          .createQueryBuilder('record')
          .where('record.organizationId = :organizationId', parameters)
          .andWhere('record.sortOrder > :cursor', parameters)
          .orderBy('record.sortOrder', 'ASC')
          .take(amount);
        if (query.search) {
          builder.leftJoin(
            'customers',
            'customer',
            'customer.organizationId = record.organizationId AND customer.id = record.customerId',
          );
          builder.andWhere(
            "(LOWER(record.number) LIKE :search ESCAPE '!' OR LOWER(record.reference) LIKE :search ESCAPE '!' OR LOWER(customer.name) LIKE :search ESCAPE '!')",
            parameters,
          );
        }
        if (query.status) {
          switch (query.status) {
            case InvoiceStatus.Paid:
              builder.andWhere('record.status = :open AND record.paid = record.amount', {
                open: InvoiceStatus.Open,
              });
              break;
            case InvoiceStatus.Overdue:
              builder.andWhere(
                'record.status = :open AND record.paid < record.amount AND record.dueAt < :today',
                { open: InvoiceStatus.Open, today: today() },
              );
              break;
            case InvoiceStatus.PartiallyPaid:
              builder.andWhere(
                'record.status = :open AND record.paid > 0 AND record.paid < record.amount AND record.dueAt >= :today',
                { open: InvoiceStatus.Open, today: today() },
              );
              break;
            case InvoiceStatus.Open:
              builder.andWhere(
                'record.status = :open AND record.paid = 0 AND record.dueAt >= :today',
                { open: InvoiceStatus.Open, today: today() },
              );
              break;
            default:
              builder.andWhere('record.status = :status', parameters);
          }
        }
        if (salespersonId) {
          builder.innerJoin(
            'customer_territories',
            'territory',
            'territory.organizationId = record.organizationId AND territory.customerId = record.customerId AND territory.userId = :salespersonId',
            { salespersonId },
          );
        }

        const result = pageResult(
          await builder.getMany(),
          query.limit,
          organization.revision,
          (row) => invoiceSchema.parse(row),
        );
        const ids = [...new Set((result.items as Invoice[]).map((invoice) => invoice.customerId))];
        const customers = ids.length
          ? await manager.getRepository(CustomerEntity).findBy({ organizationId, id: In(ids) })
          : [];
        result.customerNames = Object.fromEntries(
          customers.map((customer) => [customer.id, customer.name]),
        );

        return result;
      }

      const builder = manager
        .getRepository(PaymentEntity)
        .createQueryBuilder('record')
        .where('record.organizationId = :organizationId', parameters)
        .andWhere('record.sortOrder > :cursor', parameters)
        .orderBy('record.sortOrder', 'ASC')
        .take(amount);
      if (query.search) {
        builder.leftJoin(
          'customers',
          'customer',
          'customer.organizationId = record.organizationId AND customer.id = record.customerId',
        );
        builder.andWhere(
          "(LOWER(record.reference) LIKE :search ESCAPE '!' OR LOWER(record.description) LIKE :search ESCAPE '!' OR LOWER(customer.name) LIKE :search ESCAPE '!')",
          parameters,
        );
      }
      if (query.status) {
        builder.andWhere('record.status = :status', parameters);
      }
      if (salespersonId) {
        builder.innerJoin(
          'customer_territories',
          'territory',
          'territory.organizationId = record.organizationId AND territory.customerId = record.customerId AND territory.userId = :salespersonId',
          { salespersonId },
        );
      }

      const rows = await builder.getMany();
      const page = rows.slice(0, query.limit);
      const allocations = page.length
        ? await manager.getRepository(PaymentAllocationEntity).find({
            where: { organizationId, paymentId: In(page.map((row) => row.id)) },
            order: { sortOrder: 'ASC' },
          })
        : [];
      const allocationsByPayment = new Map<string, Payment['allocations']>();
      for (const allocation of allocations) {
        const list = allocationsByPayment.get(allocation.paymentId) ?? [];
        list.push({ invoiceId: allocation.invoiceId, amount: allocation.amount });
        allocationsByPayment.set(allocation.paymentId, list);
      }

      const result = pageResult(rows, query.limit, organization.revision, (row) => ({
        id: row.id,
        customerId: row.customerId ?? '',
        amount: row.amount,
        date: row.date,
        reference: row.reference,
        description: row.description,
        bank: row.bank,
        method: row.method,
        status: row.status,
        allocations: allocationsByPayment.get(row.id) ?? [],
      }));
      const ids = [
        ...new Set(
          (result.items as Payment[]).map((payment) => payment.customerId).filter(Boolean),
        ),
      ];
      const customers = ids.length
        ? await manager.getRepository(CustomerEntity).findBy({ organizationId, id: In(ids) })
        : [];
      result.customerNames = Object.fromEntries(
        customers.map((customer) => [customer.id, customer.name]),
      );

      return result;
    }, true);
  }

  async acquireWorkerLease(name: string, ownerToken: string, durationMs: number): Promise<boolean> {
    return this.database.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .insert()
        .into(WorkerLeaseEntity)
        .values({ name, ownerToken: '', expiresAt: new Date(0).toISOString() })
        .orIgnore()
        .execute();

      const now = new Date();
      const result = await manager
        .createQueryBuilder()
        .update(WorkerLeaseEntity)
        .set({ ownerToken, expiresAt: new Date(now.getTime() + durationMs).toISOString() })
        .where('name = :name AND expiresAt <= :now', { name, now: now.toISOString() })
        .execute();

      return result.affected === 1;
    });
  }

  async renewWorkerLease(name: string, ownerToken: string, durationMs: number): Promise<boolean> {
    return this.database.transaction(async (manager) => {
      const now = new Date();
      const result = await manager
        .createQueryBuilder()
        .update(WorkerLeaseEntity)
        .set({ expiresAt: new Date(now.getTime() + durationMs).toISOString() })
        .where('name = :name AND ownerToken = :ownerToken AND expiresAt > :now', {
          name,
          ownerToken,
          now: now.toISOString(),
        })
        .execute();

      return result.affected === 1;
    });
  }

  async releaseWorkerLease(name: string, ownerToken: string): Promise<void> {
    await this.database.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(WorkerLeaseEntity)
        .set({ ownerToken: '', expiresAt: new Date(0).toISOString() })
        .where('name = :name AND ownerToken = :ownerToken', { name, ownerToken })
        .execute();
    });
  }

  async listBankImportProfiles(organizationId: string): Promise<BankImportProfile[]> {
    return this.database.transaction(async (manager) => {
      const records = await manager.getRepository(BankImportProfileEntity).find({
        where: { organizationId },
        order: { name: 'ASC' },
      });

      return records.map((record) => ({
        name: record.name,
        columns: bankImportProfileSchema.shape.columns.parse(JSON.parse(record.columnsJson)),
        dateFormat: bankImportProfileSchema.shape.dateFormat.parse(record.dateFormat),
      }));
    }, true);
  }

  async saveBankImportProfile(organizationId: string, profile: BankImportProfile): Promise<void> {
    await this.database.transaction(async (manager) => {
      const repository = manager.getRepository(BankImportProfileEntity);
      await repository.upsert(
        {
          organizationId,
          name: profile.name,
          columnsJson: JSON.stringify(profile.columns),
          dateFormat: profile.dateFormat,
          updatedAt: new Date().toISOString(),
        },
        ['organizationId', 'name'],
      );
    });
  }

  async findReminderCandidateIds(hour: number): Promise<string[]> {
    return this.database.transaction(async (manager) => {
      const queued = await manager
        .getRepository(ReminderJobEntity)
        .createQueryBuilder('job')
        .select('DISTINCT job.organizationId', 'organizationId')
        .where('job.status = :status', { status: ReminderStatus.Queued })
        .getRawMany<{ organizationId: string }>();
      const ids = new Set(queued.map((job) => job.organizationId));
      if (hour <= 18) {
        const enabled = await manager.getRepository(WorkspaceSettingsEntity).find({
          where: { remindersEnabled: true, reminderHour: LessThanOrEqual(hour) },
          select: { organizationId: true },
        });
        for (const setting of enabled) {
          ids.add(setting.organizationId);
        }
      }

      return [...ids];
    }, true);
  }

  async findById(id: string): Promise<WorkspaceRecord> {
    return this.database.transaction(async (manager) => {
      const record = await loadWorkspaceFromDatabase(manager, id);
      if (!record) {
        throw new ConflictException('Workspace is unavailable.');
      }

      return record;
    }, true);
  }

  async findReceipt(
    organizationId: string,
    requestId: string,
  ): Promise<CommandReceiptRecord | null> {
    return this.database.transaction((manager) =>
      manager.getRepository(CommandReceiptEntity).findOneBy({ organizationId, requestId }),
    );
  }

  async save(
    record: WorkspaceRecord,
    data: Workspace,
    receipt?: { requestId: string; payloadHash: string },
  ): Promise<number> {
    if (data.organization.id !== record.id) {
      throw new ConflictException('Workspace identity cannot change.');
    }

    return this.database.transaction(async (manager) => {
      const result = await manager
        .getRepository(OrganizationEntity)
        .update({ id: record.id, revision: record.revision }, { revision: record.revision + 1 });
      if (result.affected !== 1) {
        throw new ConflictException(
          'This workspace changed in another session. Refresh and try again.',
        );
      }
      await saveWorkspaceToDatabase(manager, data);
      if (receipt) {
        await manager.getRepository(CommandReceiptEntity).insert({
          organizationId: record.id,
          requestId: receipt.requestId,
          payloadHash: receipt.payloadHash,
          revision: record.revision + 1,
          createdAt: new Date().toISOString(),
        });
      }

      return record.revision + 1;
    });
  }
}
