import { describe, expect, it } from 'vitest';
import { createDatabase } from '../server/database/data-source';
import {
  DEVELOPMENT_ORGANIZATION_ID,
  DEVELOPMENT_PASSWORD,
  ISOLATED_ORGANIZATION_ID,
} from '../server/database/development-fixtures';
import {
  DevelopmentSeedResult,
  seedDevelopmentRecords,
} from '../server/repositories/development-seed.repository';
import { loadWorkspaceFromDatabase } from '../server/repositories/workspace-database.mapper';
import { UserEntity } from '../server/models/user.model';
import { OrganizationEntity } from '../server/models/organization.model';
import { CustomerEntity } from '../server/models/customer.model';
import { verifyPassword } from '../server/utils/password';
import { applyCommand, refreshPromises } from '../shared/domain';
import { account } from '../shared/finance';
import { CommandType, PromiseStatus, Role } from '../shared/enums';

const seedDate = new Date('2026-09-12T07:00:00.000Z');

describe('development seed', () => {
  it('persists usable role accounts, coherent financial scenarios, and an isolated empty tenant', async () => {
    const database = createDatabase(true);
    await database.initialize();
    try {
      await database.transaction((manager) => seedDevelopmentRecords(manager, seedDate));
      const users = await database.getRepository(UserEntity).find();
      expect(users).toHaveLength(7);
      expect(users.every((user) => verifyPassword(DEVELOPMENT_PASSWORD, user.passwordHash))).toBe(
        true,
      );
      expect(new Set(users.map((user) => user.passwordHash)).size).toBe(7);
      const main = await loadWorkspaceFromDatabase(database.manager, DEVELOPMENT_ORGANIZATION_ID);
      const isolated = await loadWorkspaceFromDatabase(database.manager, ISOLATED_ORGANIZATION_ID);
      if (!main || !isolated) {
        throw new Error('Seed workspaces are missing.');
      }
      expect(main.data.members.map((member) => member.role)).toEqual(Object.values(Role));
      expect(isolated.data.customers).toEqual([]);
      expect(isolated.data.invoices).toEqual([]);
      expect(isolated.data.members.map((member) => member.email)).toEqual(['isolated@revora.test']);
      expect(account(main.data, 'dev-partial', '2026-09-12').outstanding).toBe(100_000 * 100);
      expect(account(main.data, 'dev-reversed', '2026-09-12').outstanding).toBe(50_000 * 100);
      expect(account(main.data, 'dev-today', '2026-09-12').overdue).toBe(0);
      refreshPromises(main.data, '2026-09-12');
      expect(main.data.promises.find((promise) => promise.id === 'dev-promise-kept')?.status).toBe(
        PromiseStatus.Kept,
      );
      expect(
        main.data.promises.find((promise) => promise.id === 'dev-promise-partial')?.status,
      ).toBe(PromiseStatus.PartiallyKept);
      for (const role of [Role.Accountant, Role.Collections, Role.Sales, Role.Viewer]) {
        expect(() =>
          applyCommand(
            main.data,
            {
              type: CommandType.UpdateCredit,
              customerId: 'dev-partial',
              limit: 1_000_000,
              reason: 'Permission check',
            },
            `Demo ${role}`,
            role,
            seedDate,
          ),
        ).toThrow('Your role cannot perform this action.');
      }
      expect(() =>
        applyCommand(
          main.data,
          {
            type: CommandType.UpdateMemberRole,
            memberId: 'dev-user-viewer',
            role: Role.Sales,
          },
          'Demo Admin',
          Role.Admin,
          seedDate,
        ),
      ).toThrow('Only the owner can change roles.');
    } finally {
      await database.destroy();
    }
  });

  it('preserves manual edits and password hashes when run again', async () => {
    const database = createDatabase(true);
    await database.initialize();
    try {
      await database.transaction((manager) => seedDevelopmentRecords(manager, seedDate));
      const before = await database
        .getRepository(UserEntity)
        .findOneByOrFail({ id: 'dev-user-owner' });
      await database
        .getRepository(CustomerEntity)
        .update(
          { organizationId: DEVELOPMENT_ORGANIZATION_ID, id: 'dev-partial' },
          { creditLimit: 99_000_000 },
        );
      const result = await database.transaction((manager) =>
        seedDevelopmentRecords(manager, seedDate),
      );
      expect(result).toBe(DevelopmentSeedResult.AlreadyExists);
      expect(await database.getRepository(UserEntity).count()).toBe(7);
      expect(
        (await database.getRepository(UserEntity).findOneByOrFail({ id: before.id })).passwordHash,
      ).toBe(before.passwordHash);
      expect(
        (
          await database
            .getRepository(CustomerEntity)
            .findOneByOrFail({ organizationId: DEVELOPMENT_ORGANIZATION_ID, id: 'dev-partial' })
        ).creditLimit,
      ).toBe(99_000_000);
    } finally {
      await database.destroy();
    }
  });

  it('does not overwrite an existing account that uses a seed email', async () => {
    const database = createDatabase(true);
    await database.initialize();
    try {
      await database.getRepository(OrganizationEntity).insert({
        id: 'existing',
        name: 'Existing workspace',
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        revision: 0,
      });
      await database.getRepository(UserEntity).insert({
        id: 'existing-owner',
        organizationId: 'existing',
        name: 'Existing Owner',
        email: 'owner@revora.test',
        passwordHash: 'existing-password-hash',
      });
      await expect(
        database.transaction((manager) => seedDevelopmentRecords(manager, seedDate)),
      ).rejects.toThrow('already exists');
      expect(await database.getRepository(OrganizationEntity).count()).toBe(1);
      expect(
        (await database.getRepository(UserEntity).findOneByOrFail({ id: 'existing-owner' }))
          .passwordHash,
      ).toBe('existing-password-hash');
    } finally {
      await database.destroy();
    }
  });
});
