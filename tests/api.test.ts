import { CommandType, CustomerStatus, Role } from '../shared/enums';
import 'reflect-metadata';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../server/app.module';
import { ApiExceptionFilter } from '../server/filters/api-exception.filter';
import { snapshotSchema, inviteResultSchema } from '../shared/schema';
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
  const response = await post('/auth/register', {
    name: 'Test Owner',
    organization: 'Test Organization',
    email,
    password: 'A-long-secure-password-123',
  });
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
  it('rejects anonymous workspace access', async () => {
    expect((await fetch(`${url}/workspace`)).status).toBe(401);
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
  it('revokes sessions on logout', async () => {
    const cookie = await createWorkspace('logout@example.com');
    expect(cookie).toContain('revora_session');
    await post('/auth/logout', {}, cookie);
    expect((await fetch(`${url}/workspace`, { headers: { Cookie: cookie } })).status).toBe(401);
  });
});
