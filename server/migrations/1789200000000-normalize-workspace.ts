import { isDeepStrictEqual } from 'node:util';
import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { z } from 'zod';
import { roleSchema, workspaceSchema } from '../../shared/schema';
import { OrganizationEntity } from '../models/organization.model';
import { UserEntity } from '../models/user.model';
import { SessionEntity } from '../models/session.model';
import { InviteEntity } from '../models/invitation.model';
import {
  loadWorkspaceFromDatabase,
  saveWorkspaceToDatabase,
} from '../repositories/workspace-database.mapper';
import { relationalTablesV1 } from './schema-v1';

const legacyOrganizationSchema = z.object({
  id: z.string(),
  revision: z.number().int().nonnegative(),
  data: z.union([z.string(), workspaceSchema]),
});
const legacyUserSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string(),
  name: z.string(),
  passwordHash: z.string(),
});
const legacySessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  expiresAt: z.string(),
  demo: z.union([z.boolean(), z.literal(0), z.literal(1)]).transform(Boolean),
});
const legacyInviteSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string(),
  role: roleSchema,
  expiresAt: z.string(),
});

export class NormalizeWorkspace1789200000000 implements MigrationInterface {
  name = 'NormalizeWorkspace1789200000000';

  async up(runner: QueryRunner): Promise<void> {
    for (const definition of relationalTablesV1) {
      // Failing on an unexpected existing table avoids adopting a partial/manual migration.
      await runner.createTable(new Table(definition));
    }
    if (!(await runner.hasTable('organization'))) {
      return;
    }
    const legacyOrganizations = z
      .array(legacyOrganizationSchema)
      .parse(await runner.query('SELECT * FROM "organization"'));
    const users = z.array(legacyUserSchema).parse(await runner.query('SELECT * FROM "user"'));
    const sessions = z
      .array(legacySessionSchema)
      .parse(await runner.query('SELECT * FROM "session"'));
    const invitations = z
      .array(legacyInviteSchema)
      .parse(await runner.query('SELECT * FROM "invite"'));
    const snapshots = legacyOrganizations.map((record) => ({
      id: record.id,
      revision: record.revision,
      data: workspaceSchema.parse(
        typeof record.data === 'string' ? JSON.parse(record.data) : record.data,
      ),
    }));
    for (const record of snapshots) {
      if (record.id !== record.data.organization.id) {
        throw new Error(
          'Legacy organization identity mismatch. Migration stopped without committing.',
        );
      }
      await runner.manager
        .getRepository(OrganizationEntity)
        .insert({ ...record.data.organization, revision: record.revision });
    }
    for (const user of users) {
      await runner.manager.getRepository(UserEntity).insert(user);
    }
    for (const record of snapshots) {
      await saveWorkspaceToDatabase(runner.manager, record.data, false);
      const restored = await loadWorkspaceFromDatabase(runner.manager, record.id, false);
      if (!restored || !isDeepStrictEqual(restored, record)) {
        throw new Error(
          'Relational data differs from the legacy workspace. Migration stopped without committing.',
        );
      }
    }
    for (const session of sessions) {
      await runner.manager.getRepository(SessionEntity).insert(session);
    }
    for (const invitation of invitations) {
      await runner.manager.getRepository(InviteEntity).insert(invitation);
    }
    // Drop the old aggregate only after every workspace has been reconstructed and compared.
    for (const table of ['session', 'invite', 'user', 'organization']) {
      await runner.dropTable(table);
    }
  }

  async down(): Promise<void> {
    throw new Error(
      'This data migration is forward-only. Restore the pre-migration backup to recover the legacy schema.',
    );
  }
}
