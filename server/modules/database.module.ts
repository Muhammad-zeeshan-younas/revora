import { Module } from '@nestjs/common';
import { DatabaseService } from '../services/database.service';
import { AuthRepository } from '../repositories/auth.repository';
import { WorkspaceRepository } from '../repositories/workspace.repository';

@Module({
  providers: [DatabaseService, AuthRepository, WorkspaceRepository],
  exports: [AuthRepository, WorkspaceRepository],
})
export class DatabaseModule {}
