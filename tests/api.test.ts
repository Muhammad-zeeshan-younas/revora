import { CommandType, CustomerStatus, InvoiceStatus, Role } from '../shared/enums';
import 'reflect-metadata';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../server/app.module';
import { ApiExceptionFilter } from '../server/filters/api-exception.filter';
import { AccountsService } from '../server/services/accounts.service';
import { EmailService } from '../server/services/email.service';
import { DatabaseService } from '../server/services/database.service';
import { OrganizationEntity } from '../server/models/organization.model';
import { UserEntity } from '../server/models/user.model';
import { EmailVerificationEntity } from '../server/models/email-verification.model';
import { SessionEntity } from '../server/models/session.model';
import { AuthRepository } from '../server/repositories/auth.repository';
import { hashToken } from '../server/utils/password';
import { snapshotSchema, inviteResultSchema } from '../shared/schema';
import { recordPageSchema } from '../shared/record-page';
import type { Command } from '../shared/schema';

let app: INestApplication;
let url = '';

async function post(path: string, body: object, cookie = ''): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}

async function createWorkspace(email: string): Promise<string> {
  await app.get(AccountsService).createCompany({
    name: 'Test Owner',
    organization: 'Test Organization',
    email,
    password: 'A-long-secure-password-123',
  });
  await app.get(DatabaseService).transaction(async (manager) => {
    const user = await manager.getRepository(UserEntity).findOneByOrFail({ email });
    await manager.getRepository(EmailVerificationEntity).insert({
      userId: user.id,
      verifiedAt: new Date().toISOString(),
      tokenId: '',
      expiresAt: '',
    });
  });
  const response = await post('/auth/login', { email, password: 'A-long-secure-password-123' });
  expect(response.status).toBe(201);

  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

async function getWorkspace(cookie: string) {
  const response = await fetch(`${url}/workspace`, { headers: { Cookie: cookie } });
  expect(response.ok).toBe(true);

  return snapshotSchema.parse(await response.json());
}
beforeAll(async () => {
  process.env['TEST_DATABASE'] = 'true';
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
}, 30000);
afterAll(async () => {
  await app.close();
  delete process.env['TEST_DATABASE'];
});
describe('authenticated tenant API', () => {
  it('exposes database readiness for deployment checks', async () => {
    const response = await fetch(`${url}/health/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
  });
  it('protects operations metrics and reports worker lease health', async () => {
    const previous = process.env['OPERATIONS_TOKEN'];
    process.env['OPERATIONS_TOKEN'] = 'm'.repeat(32);
    try {
      expect((await fetch(`${url}/health/operations`)).status).toBe(403);
      const response = await fetch(`${url}/health/operations`, {
        headers: { Authorization: `Bearer ${process.env['OPERATIONS_TOKEN']}` },
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('reminderWorkerLastDurationMs');
      expect(body).toHaveProperty('reminderLeaseExpiresAt');
    } finally {
      if (previous === undefined) {
        delete process.env['OPERATIONS_TOKEN'];
      } else {
        process.env['OPERATIONS_TOKEN'] = previous;
      }
    }
  });
  it('has no public registration endpoint and creates no account from a registration request', async () => {
    const database = app.get(DatabaseService);
    const counts = () =>
      database.transaction(async (manager) => ({
        organizations: await manager.getRepository(OrganizationEntity).count(),
        users: await manager.getRepository(UserEntity).count(),
      }));
    const before = await counts();
    const response = await post('/auth/register', {
      name: 'Uninvited User',
      organization: 'Unapproved Company',
      email: 'uninvited@example.com',
      password: 'A-long-secure-password-123',
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await counts()).toEqual(before);
  });
  it('rejects anonymous workspace access', async () => {
    expect((await fetch(`${url}/workspace`)).status).toBe(401);
  });
  it('serves bounded customer pages and an overdue filter without loading the full workspace', async () => {
    const cookie = await createWorkspace('pages-owner@example.com');
    let state = await getWorkspace(cookie);
    for (const name of ['Current Account', 'Overdue Account']) {
      const response = await post(
        '/workspace/commands',
        {
          revision: state.revision,
          command: {
            type: CommandType.CreateCustomer,
            customer: {
              name,
              contact: 'Ali Hassan',
              email: `${name.toLowerCase().replace(' ', '-')}@example.com`,
              phone: '+923001234567',
              city: 'Lahore',
              taxId: '',
              salesperson: 'Test Owner',
              creditLimit: 100000,
              terms: 30,
              status: CustomerStatus.Active,
            },
          },
        },
        cookie,
      );
      expect(response.status).toBe(201);
      state = snapshotSchema.parse(await response.json());
    }
    const overdueId = state.workspace.customers.find((item) => item.name === 'Overdue Account')!.id;
    const invoice = await post(
      '/workspace/commands',
      {
        revision: state.revision,
        command: {
          type: CommandType.CreateInvoice,
          invoice: {
            number: 'PAGED-OVERDUE-1',
            customerId: overdueId,
            issuedAt: '2025-01-01',
            dueAt: '2025-01-31',
            amount: 5000,
            status: InvoiceStatus.Open,
            reference: '',
          },
        },
      },
      cookie,
    );
    expect(invoice.status).toBe(201);

    const bootstrap = snapshotSchema.parse(
      await (
        await fetch(`${url}/workspace/bootstrap`, {
          headers: { Cookie: cookie },
        })
      ).json(),
    );
    expect(bootstrap.workspace.customers).toHaveLength(0);
    const first = recordPageSchema.parse(
      await (
        await fetch(`${url}/workspace/records/customers?limit=1`, {
          headers: { Cookie: cookie },
        })
      ).json(),
    );
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = recordPageSchema.parse(
      await (
        await fetch(`${url}/workspace/records/customers?limit=1&cursor=${first.nextCursor}`, {
          headers: { Cookie: cookie },
        })
      ).json(),
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const overdueResponse = await fetch(`${url}/workspace/records/customers?status=Overdue`, {
      headers: { Cookie: cookie },
    });
    expect(overdueResponse.status, JSON.stringify(await overdueResponse.clone().json())).toBe(200);
    const overdue = recordPageSchema.parse(await overdueResponse.json());
    expect(overdue.items.map((item) => item.id)).toEqual([overdueId]);
  });
  it('isolates organization data and rejects foreign customer IDs', async () => {
    const a = await createWorkspace('owner-a@example.com');
    const b = await createWorkspace('owner-b@example.com');
    const customer: Command = {
      type: CommandType.CreateCustomer,
      customer: {
        name: 'Private Customer',
        contact: 'Ali Hassan',
        email: 'customer@example.com',
        phone: '+923001234567',
        city: 'Lahore',
        taxId: '',
        salesperson: 'Test Owner',
        creditLimit: 10000,
        terms: 30,
        status: CustomerStatus.Active,
      },
    };
    const response = await post('/workspace/commands', { revision: 0, command: customer }, a);
    expect(response.status).toBe(201);
    const stateA = snapshotSchema.parse(await response.json());
    const stateB = await getWorkspace(b);
    expect(stateA.workspace.customers).toHaveLength(1);
    expect(stateB.workspace.customers).toHaveLength(0);
    expect(stateA.workspace.organization.id).not.toBe(stateB.workspace.organization.id);
    expect(
      (
        await post(
          '/workspace/commands',
          {
            revision: 0,
            command: {
              type: CommandType.UpdateCredit,
              customerId: stateA.workspace.customers[0]?.id,
              limit: 999,
              reason: 'Foreign account access',
            },
          },
          b,
        )
      ).status,
    ).toBe(400);
    expect((await post('/workspace/commands', { revision: 0, command: customer }, a)).status).toBe(
      409,
    );
  });
  it('validates nested input and rejects invalid money', async () => {
    const cookie = await createWorkspace('invalid-money@example.com');
    const response = await post(
      '/workspace/commands',
      {
        revision: 0,
        command: {
          type: CommandType.UpdateCredit,
          customerId: 'x',
          limit: 'untyped string',
          reason: 'Invalid amount',
        },
      },
      cookie,
    );
    expect(response.status).toBe(400);
  });
  it('creates one-use invitations and enforces viewer permissions', async () => {
    const owner = await createWorkspace('team-owner@example.com');
    const response = await post(
      '/auth/invite',
      { email: 'viewer@example.com', role: Role.Viewer },
      owner,
    );
    expect(response.status).toBe(201);
    const invitation = inviteResultSchema.parse(await response.json());
    const token = new URL(invitation.link).searchParams.get('invite');
    const accept = { token, name: 'Test Viewer', password: 'A-long-secure-password-123' };
    const joined = await post('/auth/accept-invite', accept);
    expect(joined.status).toBe(201);
    const viewer = joined.headers.get('set-cookie')?.split(';')[0] ?? '';
    const state = await getWorkspace(viewer);
    expect(state.session.user.role).toBe(Role.Viewer);
    expect(state.workspace.members).toHaveLength(2);
    expect(
      (
        await post(
          '/workspace/commands',
          {
            revision: state.revision,
            command: { type: CommandType.UpdateSettings, settings: state.workspace.settings },
          },
          viewer,
        )
      ).status,
    ).toBe(400);
    expect((await post('/auth/accept-invite', accept)).status).toBe(400);
    expect(
      (await post('/auth/invite', { email: 'other@example.com', role: Role.Admin }, viewer)).status,
    ).toBe(403);
  });
  it('emails an invitation when account email is configured', async () => {
    const mailer = app.get(EmailService);
    const configured = vi.spyOn(mailer, 'configured').mockReturnValue(true);
    const send = vi.spyOn(mailer, 'sendInvitation').mockResolvedValue();
    try {
      const owner = await createWorkspace('mail-owner@example.com');
      const response = await post(
        '/auth/invite',
        { email: 'mail-member@example.com', role: Role.Accountant },
        owner,
      );
      expect(response.status).toBe(201);
      const invitation = inviteResultSchema.parse(await response.json());
      expect(send).toHaveBeenCalledWith(
        'mail-member@example.com',
        invitation.link,
        expect.any(String),
      );
    } finally {
      configured.mockRestore();
      send.mockRestore();
    }
  });
  it('revokes sessions on logout', async () => {
    const cookie = await createWorkspace('logout@example.com');
    expect(cookie).toContain('revora_session');
    await post('/auth/logout', {}, cookie);
    expect((await fetch(`${url}/workspace`, { headers: { Cookie: cookie } })).status).toBe(401);
  });
  it('resets a password with a one-use link and revokes existing sessions', async () => {
    const mailer = app.get(EmailService);
    const configured = vi.spyOn(mailer, 'configured').mockReturnValue(true);
    let link = '';
    const send = vi.spyOn(mailer, 'sendPasswordReset').mockImplementation(async (_to, value) => {
      link = value;
    });
    try {
      const cookie = await createWorkspace('reset@example.com');
      const request = await post('/auth/password-reset/request', { email: 'reset@example.com' });
      expect(request.status).toBe(201);
      expect(send).toHaveBeenCalledOnce();
      expect(
        (await post('/auth/password-reset/request', { email: 'nobody@example.com' })).status,
      ).toBe(201);
      expect(send).toHaveBeenCalledOnce();
      const token = new URL(link).searchParams.get('reset');
      const complete = { token, password: 'A-different-secure-password-456' };
      expect((await post('/auth/password-reset/complete', complete)).status).toBe(201);
      expect((await fetch(`${url}/workspace`, { headers: { Cookie: cookie } })).status).toBe(401);
      expect((await post('/auth/password-reset/complete', complete)).status).toBe(400);
      expect(
        (
          await post('/auth/login', {
            email: 'reset@example.com',
            password: 'A-long-secure-password-123',
          })
        ).status,
      ).toBe(401);
      expect(
        (await post('/auth/login', { email: 'reset@example.com', password: complete.password }))
          .status,
      ).toBe(201);
    } finally {
      configured.mockRestore();
      send.mockRestore();
    }
  });
  it('reserves stock and credit atomically, then replaces the hold with an invoice', async () => {
    const cookie = await createWorkspace('orders-owner@example.com');
    const created = await post(
      '/workspace/commands',
      {
        revision: 0,
        command: {
          type: CommandType.CreateCustomer,
          customer: {
            name: 'Order Customer',
            contact: 'Ali Hassan',
            email: 'order-customer@example.com',
            phone: '+923001234567',
            city: 'Lahore',
            taxId: '',
            salesperson: 'Test Owner',
            creditLimit: 10000,
            terms: 30,
            status: CustomerStatus.Active,
          },
        },
      },
      cookie,
    );
    expect(created.status).toBe(201);
    const customerId = snapshotSchema.parse(await created.json()).workspace.customers[0]!.id;
    const stock = await post(
      '/workspace/inventory',
      { sku: 'SKU-1', name: 'Test item', unitPrice: 6000, onHand: 2 },
      cookie,
    );
    expect(stock.status).toBe(201);
    const itemId = ((await stock.json()) as { item: { id: string } }).item.id;
    const order = (number: string) =>
      post(
        '/workspace/orders',
        {
          number,
          customerId,
          lines: [{ itemId, quantity: 1 }],
        },
        cookie,
      );
    const responses = await Promise.all([order('ORDER-1'), order('ORDER-2')]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const winning = responses.find((response) => response.status === 201)!;
    const orderId = ((await winning.json()) as { order: { id: string } }).order.id;
    const fulfilled = await post(
      `/workspace/orders/${orderId}/fulfill`,
      { invoiceNumber: 'ORDER-INVOICE-1' },
      cookie,
    );
    expect(fulfilled.status).toBe(201);
    const workspace = await getWorkspace(cookie);
    expect(
      workspace.workspace.invoices.find((invoice) => invoice.number === 'ORDER-INVOICE-1')?.amount,
    ).toBe(6000);
    const inventory = await fetch(`${url}/workspace/inventory`, { headers: { Cookie: cookie } });
    const item = (
      (await inventory.json()) as { items: { id: string; onHand: number; reserved: number }[] }
    ).items.find((row) => row.id === itemId);
    expect(item).toMatchObject({ onHand: 1, reserved: 0 });
    const adjustment = { delta: 2, requestId: crypto.randomUUID() };
    expect((await post(`/workspace/inventory/${itemId}/adjust`, adjustment, cookie)).status).toBe(
      201,
    );
    expect((await post(`/workspace/inventory/${itemId}/adjust`, adjustment, cookie)).status).toBe(
      201,
    );
    const afterRetry = await fetch(`${url}/workspace/inventory`, { headers: { Cookie: cookie } });
    expect(((await afterRetry.json()) as { items: { onHand: number }[] }).items[0]?.onHand).toBe(3);
  });
  it('uploads a supporting PDF once and restricts downloads to its company', async () => {
    const owner = await createWorkspace('documents-owner@example.com');
    const otherCompany = await createWorkspace('documents-other@example.com');
    const created = await post(
      '/workspace/commands',
      {
        revision: 0,
        command: {
          type: CommandType.CreateCustomer,
          customer: {
            name: 'Document Customer',
            contact: 'Ali Hassan',
            email: 'document-customer@example.com',
            phone: '+923001234567',
            city: 'Karachi',
            taxId: '',
            salesperson: 'Test Owner',
            creditLimit: 10000,
            terms: 30,
            status: CustomerStatus.Active,
          },
        },
      },
      owner,
    );
    expect(created.status).toBe(201);
    const customerId = snapshotSchema.parse(await created.json()).workspace.customers[0]!.id;
    const path = `/workspace/attachments/customer/${customerId}`;
    const document = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'utf8');
    const payload = {
      fileName: 'deposit-slip.pdf',
      mediaType: 'application/pdf',
      contentBase64: document.toString('base64'),
    };

    const upload = await post(path, payload, owner);
    expect(upload.status).toBe(201);
    const attachment = (await upload.json()) as { id: string; byteLength: number };
    expect(attachment.byteLength).toBe(document.length);
    const retry = await post(path, payload, owner);
    expect(((await retry.json()) as { id: string }).id).toBe(attachment.id);

    const list = await fetch(`${url}${path}`, { headers: { Cookie: owner } });
    expect(((await list.json()) as { id: string }[]).map((item) => item.id)).toEqual([
      attachment.id,
    ]);
    const download = await fetch(`${url}/workspace/attachments/${attachment.id}/download`, {
      headers: { Cookie: owner },
    });
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(document);
    expect(
      (
        await fetch(`${url}/workspace/attachments/${attachment.id}/download`, {
          headers: { Cookie: otherCompany },
        })
      ).status,
    ).toBe(404);
    expect((await fetch(`${url}/workspace/attachments/${attachment.id}/download`)).status).toBe(
      401,
    );
    expect((await post(path, { ...payload, mediaType: 'image/png' }, owner)).status).toBe(400);
  });
  it('rejects a session at its exact expiration time', async () => {
    const cookie = await createWorkspace('expires@example.com');
    const token = cookie.slice(cookie.indexOf('=') + 1);
    const id = hashToken(token);
    const expiresAt = '2026-09-12T12:00:00.000Z';
    const database = app.get(DatabaseService);
    await database.transaction(async (manager) => {
      await manager.getRepository(SessionEntity).update({ id }, { expiresAt });
    });
    expect(await app.get(AuthRepository).findAuthenticatedSession(id, expiresAt)).toBeNull();
  });
});
