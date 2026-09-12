import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { createDatabase } from '../server/database/data-source';
import { OrganizationEntity } from '../server/models/organization.model';
import { UserEntity } from '../server/models/user.model';
import { InvoiceEntity } from '../server/models/invoice.model';
import {
  loadWorkspaceFromDatabase,
  saveWorkspaceToDatabase,
} from '../server/repositories/workspace-database.mapper';
import { createDemo } from '../shared/seed';
import { Role } from '../shared/enums';
import type { Workspace } from '../shared/schema';

function workspace(id: string): Workspace {
  const result = createDemo(id);
  result.members.push({
    id: `owner-${id}`,
    name: 'Test Owner',
    email: `${id}@example.com`,
    role: Role.Owner,
  });

  return result;
}

async function insertWorkspace(database: DataSource, data: Workspace): Promise<void> {
  await database.transaction(async (manager) => {
    await manager.getRepository(OrganizationEntity).insert({ ...data.organization, revision: 0 });
    for (const member of data.members) {
      await manager.getRepository(UserEntity).insert({
        id: member.id,
        organizationId: data.organization.id,
        email: member.email,
        name: member.name,
        passwordHash: 'test-hash',
      });
    }
    await saveWorkspaceToDatabase(manager, data);
  });
}

describe('relational workspace persistence', () => {
  it('preserves legacy balances, allocations, memberships, sessions, and revisions during migration', async () => {
    const database = createDatabase(true);
    database.setOptions({ migrationsRun: false });
    await database.initialize();
    try {
      await database.query(
        'CREATE TABLE "organization" ("id" varchar PRIMARY KEY, "data" text NOT NULL, "revision" integer NOT NULL)',
      );
      await database.query(
        'CREATE TABLE "user" ("id" varchar PRIMARY KEY, "organizationId" varchar NOT NULL, "email" varchar NOT NULL, "name" varchar NOT NULL, "passwordHash" varchar NOT NULL)',
      );
      await database.query(
        'CREATE TABLE "session" ("id" varchar PRIMARY KEY, "userId" varchar NOT NULL, "expiresAt" varchar NOT NULL, "demo" boolean NOT NULL)',
      );
      await database.query(
        'CREATE TABLE "invite" ("id" varchar PRIMARY KEY, "organizationId" varchar NOT NULL, "email" varchar NOT NULL, "role" varchar NOT NULL, "expiresAt" varchar NOT NULL)',
      );
      const data = workspace('legacy');
      await database.query('INSERT INTO "organization" VALUES (?, ?, ?)', [
        'legacy',
        JSON.stringify(data),
        7,
      ]);
      await database.query('INSERT INTO "user" VALUES (?, ?, ?, ?, ?)', [
        'owner-legacy',
        'legacy',
        'legacy@example.com',
        'Test Owner',
        'test-hash',
      ]);
      await database.query('INSERT INTO "session" VALUES (?, ?, ?, ?)', [
        'session-hash',
        'owner-legacy',
        '2099-01-01T00:00:00.000Z',
        1,
      ]);
      await database.runMigrations({ transaction: 'all' });
      expect(await loadWorkspaceFromDatabase(database.manager, 'legacy')).toEqual({
        id: 'legacy',
        revision: 7,
        data,
      });
      const runner = database.createQueryRunner();
      try {
        expect(await runner.hasTable('organization')).toBe(false);
        expect(await runner.query('PRAGMA foreign_key_check')).toEqual([]);
      } finally {
        await runner.release();
      }
      expect(await database.query('SELECT "id" FROM "sessions"')).toEqual([{ id: 'session-hash' }]);
    } finally {
      await database.destroy();
    }
  });

  it('isolates repeated tenant IDs and rejects an invoice referencing another organization customer', async () => {
    const database = createDatabase(true);
    await database.initialize();
    try {
      const first = workspace('first');
      const second = workspace('second');
      const privateCustomer = first.customers[0];
      if (!privateCustomer) {
        throw new Error('Demo fixture requires a customer.');
      }
      first.customers.push({
        ...privateCustomer,
        id: 'private-first',
        name: 'Private first customer',
      });
      await insertWorkspace(database, first);
      await insertWorkspace(database, second);
      expect((await loadWorkspaceFromDatabase(database.manager, 'first'))?.data).toEqual(first);
      expect((await loadWorkspaceFromDatabase(database.manager, 'second'))?.data).toEqual(second);
      const invoice = first.invoices[0];
      if (!invoice) {
        throw new Error('Demo fixture requires an invoice.');
      }
      await expect(
        database.getRepository(InvoiceEntity).insert({
          ...invoice,
          id: 'foreign-invoice',
          organizationId: 'second',
          customerId: 'private-first',
          number: 'foreign-invoice',
          numberKey: 'foreign-invoice',
          sortOrder: 0,
        }),
      ).rejects.toThrow();
    } finally {
      await database.destroy();
    }
  });

  it('rolls back the revision and all prior row updates when a later unique constraint fails', async () => {
    const database = createDatabase(true);
    await database.initialize();
    try {
      const original = workspace('rollback');
      await insertWorkspace(database, original);
      const changed = structuredClone(original);
      const customer = changed.customers[0];
      const payment = changed.payments[0];
      if (!customer || !payment) {
        throw new Error('Demo fixture requires a customer and payment.');
      }
      customer.creditLimit = 90_000_000_000;
      changed.payments.push({ ...payment, id: 'duplicate-reference', allocations: [] });
      await expect(
        database.transaction(async (manager) => {
          await manager
            .getRepository(OrganizationEntity)
            .update({ id: 'rollback' }, { revision: 1 });
          await saveWorkspaceToDatabase(manager, changed);
        }),
      ).rejects.toThrow();
      expect(await loadWorkspaceFromDatabase(database.manager, 'rollback')).toEqual({
        id: 'rollback',
        revision: 0,
        data: original,
      });
    } finally {
      await database.destroy();
    }
  });
});
