import type { EntityManager } from 'typeorm';
import { OrganizationEntity } from '../models/organization.model';
import { UserEntity } from '../models/user.model';
import {
  createDevelopmentWorkspaces,
  DEVELOPMENT_PASSWORD,
} from '../database/development-fixtures';
import { hashPassword } from '../utils/password';
import { saveWorkspaceToDatabase } from './workspace-database.mapper';

export enum DevelopmentSeedResult {
  Created = 'created',
  AlreadyExists = 'already-exists',
}

/** The caller owns the transaction. Existing demo workspaces are never reset. */
export async function seedDevelopmentRecords(
  manager: EntityManager,
  now = new Date(),
): Promise<DevelopmentSeedResult> {
  const workspaces = createDevelopmentWorkspaces(now);
  let existingCount = 0;
  for (const workspace of workspaces) {
    const existing = await manager
      .getRepository(OrganizationEntity)
      .findOneBy({ id: workspace.organization.id });
    if (existing) {
      existingCount++;
    }
  }
  if (existingCount === workspaces.length) {
    return DevelopmentSeedResult.AlreadyExists;
  }
  if (existingCount > 0) {
    throw new Error(
      'Only part of the development seed exists. No records were changed. Use a fresh development database for a complete seed.',
    );
  }
  for (const workspace of workspaces) {
    for (const member of workspace.members) {
      const existing = await manager.getRepository(UserEntity).findOneBy({ email: member.email });
      if (existing) {
        throw new Error(
          `Seed account ${member.email} already exists. No existing account will be overwritten.`,
        );
      }
    }
  }
  for (const workspace of workspaces) {
    await manager
      .getRepository(OrganizationEntity)
      .insert({ ...workspace.organization, revision: 0 });
    for (const member of workspace.members) {
      await manager.getRepository(UserEntity).insert({
        id: member.id,
        organizationId: workspace.organization.id,
        name: member.name,
        email: member.email,
        passwordHash: hashPassword(DEVELOPMENT_PASSWORD),
      });
    }
    await saveWorkspaceToDatabase(manager, workspace);
  }

  return DevelopmentSeedResult.Created;
}
