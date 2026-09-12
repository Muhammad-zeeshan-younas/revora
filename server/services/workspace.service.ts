import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { applyCommand, refreshPromises } from '../../shared/domain';
import type { Mutation, Session, Snapshot } from '../../shared/schema';
import { WorkspaceRepository } from '../repositories/workspace.repository';

@Injectable()
export class WorkspaceService {
  constructor(@Inject(WorkspaceRepository) private readonly workspaces: WorkspaceRepository) {}

  async read(session: Session): Promise<Snapshot> {
    const record = await this.workspaces.findById(session.organizationId);
    refreshPromises(record.data);

    return { workspace: record.data, revision: record.revision, session };
  }

  async execute(session: Session, mutation: Mutation): Promise<Snapshot> {
    const record = await this.workspaces.findById(session.organizationId);
    if (mutation.revision !== record.revision) {
      throw new ConflictException('Workspace changed. Refresh before trying again.');
    }
    let data = record.data;
    try {
      data = applyCommand(record.data, mutation.command, session.user.name, session.user.role);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid operation.');
    }
    const revision = await this.workspaces.save(record, data);

    return { workspace: data, revision, session };
  }
}
