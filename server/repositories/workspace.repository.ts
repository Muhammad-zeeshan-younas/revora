import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Workspace } from '../../shared/schema';
import { DatabaseService } from '../services/database.service';
import { OrganizationEntity } from '../models/organization.model';
import type { WorkspaceRecord } from '../interfaces/workspace-record.interface';
import { loadWorkspaceFromDatabase, saveWorkspaceToDatabase } from './workspace-database.mapper';

@Injectable()
export class WorkspaceRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async findAll(): Promise<WorkspaceRecord[]> {
    return this.database.transaction(async (manager) => {
      const organizations = await manager.getRepository(OrganizationEntity).find();
      const records: WorkspaceRecord[] = [];
      for (const organization of organizations) {
        const record = await loadWorkspaceFromDatabase(manager, organization.id);
        if (record) {
          records.push(record);
        }
      }

      return records;
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

  async save(record: WorkspaceRecord, data: Workspace): Promise<number> {
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

      return record.revision + 1;
    });
  }
}
