import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../services/database.service';
import { UserEntity } from '../models/user.model';
import type { UserRecord } from '../models/user.model';
import { SessionEntity } from '../models/session.model';
import type { SessionRecord } from '../models/session.model';
import { InviteEntity } from '../models/invitation.model';
import type { InviteRecord } from '../models/invitation.model';
import { OrganizationEntity } from '../models/organization.model';
import type { WorkspaceRecord } from '../interfaces/workspace-record.interface';
import { saveWorkspaceToDatabase } from './workspace-database.mapper';

@Injectable()
export class AuthRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.database.transaction((manager) =>
      manager.getRepository(UserEntity).findOneBy({ email }),
    );
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.database.transaction((manager) =>
      manager.getRepository(UserEntity).findOneBy({ id }),
    );
  }

  async createAccount(organization: WorkspaceRecord, user: UserRecord): Promise<void> {
    await this.database.transaction(async (manager) => {
      await manager
        .getRepository(OrganizationEntity)
        .insert({ ...organization.data.organization, revision: organization.revision });
      await manager.getRepository(UserEntity).insert(user);
      await saveWorkspaceToDatabase(manager, organization.data);
    });
  }

  async findSession(id: string): Promise<SessionRecord | null> {
    return this.database.transaction((manager) =>
      manager.getRepository(SessionEntity).findOneBy({ id }),
    );
  }

  async saveSession(session: SessionRecord): Promise<void> {
    await this.database.transaction(async (manager) => {
      await manager.getRepository(SessionEntity).save(session);
    });
  }

  async deleteSession(id: string): Promise<void> {
    await this.database.transaction(async (manager) => {
      await manager.getRepository(SessionEntity).delete({ id });
    });
  }

  async findInvitation(id: string): Promise<InviteRecord | null> {
    return this.database.transaction((manager) =>
      manager.getRepository(InviteEntity).findOneBy({ id }),
    );
  }

  async createInvitation(invitation: InviteRecord, organization: WorkspaceRecord): Promise<void> {
    await this.database.transaction(async (manager) => {
      const result = await manager
        .getRepository(OrganizationEntity)
        .update(
          { id: organization.id, revision: organization.revision },
          { revision: organization.revision + 1 },
        );
      if (result.affected !== 1) {
        throw new ConflictException('Workspace changed. Please retry.');
      }
      await manager.getRepository(InviteEntity).insert(invitation);
      await saveWorkspaceToDatabase(manager, organization.data);
    });
  }

  async acceptInvitation(
    invitationId: string,
    organization: WorkspaceRecord,
    user: UserRecord,
  ): Promise<void> {
    await this.database.transaction(async (manager) => {
      const consumed = await manager.getRepository(InviteEntity).delete({ id: invitationId });
      if (consumed.affected !== 1) {
        throw new ConflictException('Invitation has already been used.');
      }
      const result = await manager
        .getRepository(OrganizationEntity)
        .update(
          { id: organization.id, revision: organization.revision },
          { revision: organization.revision + 1 },
        );
      if (result.affected !== 1) {
        throw new ConflictException('Workspace changed. Please retry.');
      }
      await manager.getRepository(UserEntity).insert(user);
      await saveWorkspaceToDatabase(manager, organization.data);
    });
  }
}
