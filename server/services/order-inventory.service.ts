import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { In, LessThan, MoreThan } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { z } from 'zod';
import { FINANCE } from '../../shared/constants';
import { AuditEvent, CustomerStatus, InvoiceStatus, OrderStatus, Role } from '../../shared/enums';
import { offsetDate, today } from '../../shared/finance';
import type { Session } from '../../shared/schema';
import { AuditEventEntity } from '../models/audit-event.model';
import { CustomerTerritoryEntity } from '../models/customer-territory.model';
import { CommandReceiptEntity } from '../models/command-receipt.model';
import { CustomerEntity } from '../models/customer.model';
import { InventoryItemEntity } from '../models/inventory-item.model';
import type { InventoryItemRecord } from '../models/inventory-item.model';
import { InvoiceEntity } from '../models/invoice.model';
import { OrganizationEntity } from '../models/organization.model';
import { SalesOrderLineEntity } from '../models/sales-order-line.model';
import type { SalesOrderLineRecord } from '../models/sales-order-line.model';
import { SalesOrderEntity } from '../models/sales-order.model';
import type { SalesOrderRecord } from '../models/sales-order.model';
import { DatabaseService } from './database.service';

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;
const PAGE_SIZE = 50;
const MAXIMUM_ORDER_LINES = 20;
const MAXIMUM_QUANTITY = 1_000_000;

const itemSchema = z.object({
  sku: z.string().trim().toUpperCase().regex(SKU_PATTERN),
  name: z.string().trim().min(2).max(120),
  unitPrice: z.number().int().positive().max(FINANCE.maximumAmount),
  onHand: z.number().int().min(0).max(MAXIMUM_QUANTITY),
});
const stockSchema = z.object({
  delta: z
    .number()
    .int()
    .min(-MAXIMUM_QUANTITY)
    .max(MAXIMUM_QUANTITY)
    .refine((value) => value !== 0),
  requestId: z.uuid(),
});
const reserveSchema = z.object({
  number: z.string().trim().min(2).max(60),
  customerId: z.string().min(1).max(100),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1).max(100),
        quantity: z.number().int().min(1).max(MAXIMUM_QUANTITY),
      }),
    )
    .min(1)
    .max(MAXIMUM_ORDER_LINES),
});
const fulfillSchema = z.object({ invoiceNumber: z.string().trim().min(2).max(100) });

export interface OrderPage {
  items: (SalesOrderRecord & { lines: SalesOrderLineRecord[] })[];
  nextCursor: number | null;
  revision: number;
}

@Injectable()
export class OrderInventoryService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async activeHolds(organizationId: string): Promise<Map<string, number>> {
    return this.database.transaction(async (manager) => {
      const rows = await manager
        .getRepository(SalesOrderEntity)
        .createQueryBuilder('order')
        .select('order.customerId', 'customerId')
        .addSelect('SUM(order.amount)', 'amount')
        .where('order.organizationId = :organizationId AND order.status = :status', {
          organizationId,
          status: OrderStatus.Reserved,
        })
        .groupBy('order.customerId')
        .getRawMany<{ customerId: string; amount: string | number }>();

      return new Map(rows.map((row) => [row.customerId, Number(row.amount)]));
    }, true);
  }

  async visibleHolds(session: Session): Promise<Record<string, number>> {
    const holds = await this.activeHolds(session.organizationId);
    if (session.user.role !== Role.Sales) {return Object.fromEntries(holds);}
    const territories = await this.database.transaction(
      (manager) =>
        manager
          .getRepository(CustomerTerritoryEntity)
          .findBy({ organizationId: session.organizationId, userId: session.user.id }),
      true,
    );
    const allowed = new Set(territories.map((row) => row.customerId));

    return Object.fromEntries([...holds].filter(([customerId]) => allowed.has(customerId)));
  }

  private async lockOrganization(manager: EntityManager, organizationId: string): Promise<number> {
    const row = await manager.getRepository(OrganizationEntity).findOne({
      where: { id: organizationId },
      ...(this.database.connection.options.type === 'postgres'
        ? { lock: { mode: 'pessimistic_write' as const } }
        : {}),
    });
    if (!row) {throw new NotFoundException('Workspace was not found.');}

    return row.revision;
  }

  private async advanceRevision(
    manager: EntityManager,
    organizationId: string,
    revision: number,
  ): Promise<number> {
    const changed = await manager
      .getRepository(OrganizationEntity)
      .update({ id: organizationId, revision }, { revision: revision + 1 });
    if (changed.affected !== 1)
      {throw new ConflictException('Workspace changed. Refresh and try again.');}

    return revision + 1;
  }

  private async audit(
    manager: EntityManager,
    session: Session,
    action: AuditEvent,
    detail: string,
    entityId: string,
  ): Promise<void> {
    const result = await manager
      .getRepository(AuditEventEntity)
      .createQueryBuilder('event')
      .select('MIN(event.sortOrder)', 'minimum')
      .where('event.organizationId = :organizationId', { organizationId: session.organizationId })
      .getRawOne<{ minimum: number | null }>();
    await manager.getRepository(AuditEventEntity).insert({
      id: randomUUID(),
      organizationId: session.organizationId,
      sortOrder: Number(result?.minimum ?? 0) - 1,
      at: new Date().toISOString(),
      actor: session.user.name,
      action,
      detail,
      entityId,
    });
  }

  private requireFinance(session: Session): void {
    if (![Role.Owner, Role.Admin, Role.Accountant].includes(session.user.role)) {
      throw new ForbiddenException('Your role cannot change inventory or fulfill orders.');
    }
  }

  private async requireCustomer(manager: EntityManager, session: Session, customerId: string) {
    const customer = await manager
      .getRepository(CustomerEntity)
      .findOneBy({ organizationId: session.organizationId, id: customerId });
    if (!customer) {throw new NotFoundException('Customer was not found.');}
    if (session.user.role === Role.Sales) {
      const assigned = await manager
        .getRepository(CustomerTerritoryEntity)
        .findOneBy({ organizationId: session.organizationId, customerId, userId: session.user.id });
      if (!assigned) {throw new ForbiddenException('Customer is outside your assigned territory.');}
    }

    return customer;
  }

  async inventory(
    session: Session,
    cursor?: string,
  ): Promise<{ items: InventoryItemRecord[]; nextCursor: string | null }> {
    return this.database.transaction(async (manager) => {
      const rows = await manager.getRepository(InventoryItemEntity).find({
        where: {
          organizationId: session.organizationId,
          ...(cursor ? { sku: MoreThan(cursor) } : {}),
        },
        order: { sku: 'ASC' },
        take: PAGE_SIZE + 1,
      });

      return {
        items: rows.slice(0, PAGE_SIZE),
        nextCursor: rows.length > PAGE_SIZE ? rows[PAGE_SIZE - 1]!.sku : null,
      };
    }, true);
  }

  async orders(session: Session, cursor?: number): Promise<OrderPage> {
    return this.database.transaction(async (manager) => {
      const organization = await manager
        .getRepository(OrganizationEntity)
        .findOneByOrFail({ id: session.organizationId });
      const assignedIds =
        session.user.role === Role.Sales
          ? (
              await manager
                .getRepository(CustomerTerritoryEntity)
                .findBy({ organizationId: session.organizationId, userId: session.user.id })
            ).map((row) => row.customerId)
          : null;
      if (assignedIds && !assignedIds.length)
        {return { items: [], nextCursor: null, revision: organization.revision };}
      const rows = await manager.getRepository(SalesOrderEntity).find({
        where: {
          organizationId: session.organizationId,
          ...(cursor !== undefined ? { sortOrder: LessThan(cursor) } : {}),
          ...(assignedIds ? { customerId: In(assignedIds) } : {}),
        },
        order: { sortOrder: 'DESC' },
        take: PAGE_SIZE + 1,
      });
      const page = rows.slice(0, PAGE_SIZE);
      const lines = page.length
        ? await manager
            .getRepository(SalesOrderLineEntity)
            .findBy({
              organizationId: session.organizationId,
              orderId: In(page.map((row) => row.id)),
            })
        : [];
      const linesByOrder = new Map<string, SalesOrderLineRecord[]>();
      for (const line of lines) {
        const list = linesByOrder.get(line.orderId) ?? [];
        list.push(line);
        linesByOrder.set(line.orderId, list);
      }

      return {
        items: page.map((row) => ({ ...row, lines: linesByOrder.get(row.id) ?? [] })),
        nextCursor: rows.length > PAGE_SIZE ? page.at(-1)!.sortOrder : null,
        revision: organization.revision,
      };
    }, true);
  }

  async createItem(
    session: Session,
    body: object,
  ): Promise<{ item: InventoryItemRecord; revision: number }> {
    this.requireFinance(session);
    const input = itemSchema.parse(body);

    return this.database.transaction(async (manager) => {
      const revision = await this.lockOrganization(manager, session.organizationId);
      const repository = manager.getRepository(InventoryItemEntity);
      if (await repository.findOneBy({ organizationId: session.organizationId, sku: input.sku })) {
        throw new BadRequestException('SKU already exists. Adjust its stock instead.');
      }
      const item = {
        ...input,
        id: randomUUID(),
        organizationId: session.organizationId,
        reserved: 0,
      };
      await repository.insert(item);
      await this.audit(
        manager,
        session,
        AuditEvent.StockUpdated,
        `${item.sku}: item created with ${item.onHand} units`,
        item.id,
      );

      return {
        item,
        revision: await this.advanceRevision(manager, session.organizationId, revision),
      };
    });
  }

  async adjustStock(
    session: Session,
    itemId: string,
    body: object,
  ): Promise<{ item: InventoryItemRecord; revision: number }> {
    this.requireFinance(session);
    const { delta, requestId } = stockSchema.parse(body);
    const payloadHash = createHash('sha256')
      .update(`inventory.adjust:${itemId}:${delta}`)
      .digest('hex');

    return this.database.transaction(async (manager) => {
      const revision = await this.lockOrganization(manager, session.organizationId);
      const repository = manager.getRepository(InventoryItemEntity);
      const item = await repository.findOneBy({
        organizationId: session.organizationId,
        id: itemId,
      });
      if (!item) {throw new NotFoundException('Stock item was not found.');}
      const receipt = await manager
        .getRepository(CommandReceiptEntity)
        .findOneBy({ organizationId: session.organizationId, requestId });
      if (receipt) {
        if (receipt.payloadHash !== payloadHash)
          {throw new ConflictException('Request ID was already used for a different stock change.');}

        return { item, revision: receipt.revision };
      }
      const next = item.onHand + delta;
      if (next < item.reserved || next > MAXIMUM_QUANTITY)
        {throw new BadRequestException('Stock adjustment would conflict with reserved quantities.');}
      item.onHand = next;
      await repository.update(
        { organizationId: session.organizationId, id: itemId },
        { onHand: next },
      );
      await this.audit(
        manager,
        session,
        AuditEvent.StockUpdated,
        `${item.sku}: stock adjusted by ${delta} to ${next}`,
        item.id,
      );
      const nextRevision = await this.advanceRevision(manager, session.organizationId, revision);
      await manager.getRepository(CommandReceiptEntity).insert({
        organizationId: session.organizationId,
        requestId,
        payloadHash,
        revision: nextRevision,
        createdAt: new Date().toISOString(),
      });

      return { item, revision: nextRevision };
    });
  }

  async reserve(
    session: Session,
    body: object,
  ): Promise<{ order: SalesOrderRecord; revision: number }> {
    if (session.user.role === Role.Viewer || session.user.role === Role.Collections)
      {throw new ForbiddenException('Your role cannot place orders.');}
    const input = reserveSchema.parse(body);
    if (new Set(input.lines.map((line) => line.itemId)).size !== input.lines.length)
      {throw new BadRequestException('Combine repeated stock items into one order line.');}

    return this.database.transaction(async (manager) => {
      const revision = await this.lockOrganization(manager, session.organizationId);
      const customer = await this.requireCustomer(manager, session, input.customerId);
      if (customer.status !== CustomerStatus.Active)
        {throw new BadRequestException('Customer is on hold.');}
      const orderRepository = manager.getRepository(SalesOrderEntity);
      if (
        await orderRepository.findOneBy({
          organizationId: session.organizationId,
          number: input.number,
        })
      )
        {throw new BadRequestException('Order number already exists.');}
      const items = await manager
        .getRepository(InventoryItemEntity)
        .findBy({
          organizationId: session.organizationId,
          id: In(input.lines.map((line) => line.itemId)),
        });
      const byId = new Map(items.map((item) => [item.id, item]));
      let amount = 0;
      for (const line of input.lines) {
        const item = byId.get(line.itemId);
        if (!item) {throw new BadRequestException('Order contains an unknown stock item.');}
        if (item.onHand - item.reserved < line.quantity)
          {throw new ConflictException(`${item.sku} has insufficient available stock.`);}
        amount += line.quantity * item.unitPrice;
      }
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > FINANCE.maximumAmount)
        {throw new BadRequestException('Order total exceeds the allowed amount.');}
      const existingInvoices = await manager
        .getRepository(InvoiceEntity)
        .createQueryBuilder('invoice')
        .select('COALESCE(SUM(invoice.amount - invoice.paid), 0)', 'total')
        .where('invoice.organizationId = :organizationId AND invoice.customerId = :customerId', {
          organizationId: session.organizationId,
          customerId: customer.id,
        })
        .andWhere('invoice.status NOT IN (:...excluded)', {
          excluded: [InvoiceStatus.Draft, InvoiceStatus.WrittenOff],
        })
        .getRawOne<{ total: string | number }>();
      const heldOrders = await orderRepository
        .createQueryBuilder('order')
        .select('COALESCE(SUM(order.amount), 0)', 'total')
        .where(
          'order.organizationId = :organizationId AND order.customerId = :customerId AND order.status = :status',
          {
            organizationId: session.organizationId,
            customerId: customer.id,
            status: OrderStatus.Reserved,
          },
        )
        .getRawOne<{ total: string | number }>();
      if (
        Number(existingInvoices?.total ?? 0) + Number(heldOrders?.total ?? 0) + amount >
        customer.creditLimit
      ) {
        throw new ConflictException('Order exceeds available customer credit.');
      }
      const maximum = await orderRepository
        .createQueryBuilder('order')
        .select('MAX(order.sortOrder)', 'maximum')
        .where('order.organizationId = :organizationId', { organizationId: session.organizationId })
        .getRawOne<{ maximum: number | null }>();
      const order: SalesOrderRecord = {
        organizationId: session.organizationId,
        id: randomUUID(),
        sortOrder: Number(maximum?.maximum ?? -1) + 1,
        number: input.number,
        customerId: customer.id,
        status: OrderStatus.Reserved,
        amount,
        createdAt: new Date().toISOString(),
        createdBy: session.user.name,
        invoiceId: '',
      };
      await orderRepository.insert(order);
      for (const line of input.lines) {
        const item = byId.get(line.itemId)!;
        await manager
          .getRepository(InventoryItemEntity)
          .update(
            { organizationId: session.organizationId, id: item.id },
            { reserved: item.reserved + line.quantity },
          );
        await manager
          .getRepository(SalesOrderLineEntity)
          .insert({
            organizationId: session.organizationId,
            orderId: order.id,
            itemId: item.id,
            quantity: line.quantity,
            unitPrice: item.unitPrice,
          });
      }
      await this.audit(
        manager,
        session,
        AuditEvent.OrderReserved,
        `${order.number}: stock and Rs ${amount / 100} credit reserved`,
        order.id,
      );

      return {
        order,
        revision: await this.advanceRevision(manager, session.organizationId, revision),
      };
    });
  }

  async cancel(session: Session, orderId: string): Promise<{ revision: number }> {
    return this.database.transaction(async (manager) => {
      const revision = await this.lockOrganization(manager, session.organizationId);
      const repository = manager.getRepository(SalesOrderEntity);
      const order = await repository.findOneBy({
        organizationId: session.organizationId,
        id: orderId,
      });
      if (!order) {throw new NotFoundException('Order was not found.');}
      await this.requireCustomer(manager, session, order.customerId);
      if (session.user.role === Role.Viewer || session.user.role === Role.Collections)
        {throw new ForbiddenException('Your role cannot cancel orders.');}
      if (order.status !== OrderStatus.Reserved)
        {throw new ConflictException('Only reserved orders can be cancelled.');}
      const lines = await manager
        .getRepository(SalesOrderLineEntity)
        .findBy({ organizationId: session.organizationId, orderId });
      for (const line of lines) {
        const item = await manager
          .getRepository(InventoryItemEntity)
          .findOneByOrFail({ organizationId: session.organizationId, id: line.itemId });
        await manager
          .getRepository(InventoryItemEntity)
          .update(
            { organizationId: session.organizationId, id: item.id },
            { reserved: item.reserved - line.quantity },
          );
      }
      await repository.update(
        { organizationId: session.organizationId, id: orderId },
        { status: OrderStatus.Cancelled },
      );
      await this.audit(
        manager,
        session,
        AuditEvent.OrderCancelled,
        `${order.number}: stock and credit hold released`,
        order.id,
      );

      return { revision: await this.advanceRevision(manager, session.organizationId, revision) };
    });
  }

  async fulfill(
    session: Session,
    orderId: string,
    body: object,
  ): Promise<{ invoiceId: string; revision: number }> {
    this.requireFinance(session);
    const { invoiceNumber } = fulfillSchema.parse(body);

    return this.database.transaction(async (manager) => {
      const revision = await this.lockOrganization(manager, session.organizationId);
      const orderRepository = manager.getRepository(SalesOrderEntity);
      const order = await orderRepository.findOneBy({
        organizationId: session.organizationId,
        id: orderId,
      });
      if (!order) {throw new NotFoundException('Order was not found.');}
      if (order.status !== OrderStatus.Reserved)
        {throw new ConflictException('Only reserved orders can be fulfilled.');}
      const customer = await this.requireCustomer(manager, session, order.customerId);
      const invoiceRepository = manager.getRepository(InvoiceEntity);
      const numberKey = invoiceNumber.toLowerCase();
      if (await invoiceRepository.findOneBy({ organizationId: session.organizationId, numberKey }))
        {throw new BadRequestException('Invoice number already exists.');}
      const lines = await manager
        .getRepository(SalesOrderLineEntity)
        .findBy({ organizationId: session.organizationId, orderId });
      for (const line of lines) {
        const item = await manager
          .getRepository(InventoryItemEntity)
          .findOneByOrFail({ organizationId: session.organizationId, id: line.itemId });
        if (item.onHand < line.quantity || item.reserved < line.quantity)
          {throw new ConflictException('Reserved stock changed. Review this order.');}
        await manager
          .getRepository(InventoryItemEntity)
          .update(
            { organizationId: session.organizationId, id: item.id },
            { onHand: item.onHand - line.quantity, reserved: item.reserved - line.quantity },
          );
      }
      const maximum = await invoiceRepository
        .createQueryBuilder('invoice')
        .select('MAX(invoice.sortOrder)', 'maximum')
        .where('invoice.organizationId = :organizationId', {
          organizationId: session.organizationId,
        })
        .getRawOne<{ maximum: number | null }>();
      const invoiceId = randomUUID();
      const issuedAt = today();
      await invoiceRepository.insert({
        organizationId: session.organizationId,
        id: invoiceId,
        sortOrder: Number(maximum?.maximum ?? -1) + 1,
        number: invoiceNumber,
        numberKey,
        customerId: customer.id,
        issuedAt,
        dueAt: offsetDate(issuedAt, customer.terms),
        amount: order.amount,
        paid: 0,
        status: InvoiceStatus.Open,
        reference: order.number,
      });
      await orderRepository.update(
        { organizationId: session.organizationId, id: orderId },
        { status: OrderStatus.Fulfilled, invoiceId },
      );
      await this.audit(
        manager,
        session,
        AuditEvent.OrderFulfilled,
        `${order.number}: stock dispatched and invoice ${invoiceNumber} recorded`,
        order.id,
      );

      return {
        invoiceId,
        revision: await this.advanceRevision(manager, session.organizationId, revision),
      };
    });
  }
}
