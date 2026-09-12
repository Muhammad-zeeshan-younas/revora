import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { mutationSchema } from '../../shared/schema';
import type { Snapshot } from '../../shared/schema';
import type { AuthRequest } from '../interfaces/auth-request.interface';
import { SessionGuard } from '../guards/session.guard';
import { WorkspaceService } from '../services/workspace.service';

@Controller('workspace')
@UseGuards(SessionGuard)
export class WorkspaceController {
  constructor(@Inject(WorkspaceService) private readonly workspace: WorkspaceService) {}

  @Get()
  async read(@Req() request: AuthRequest): Promise<Snapshot> {
    return this.workspace.read(request.auth);
  }

  @Post('commands')
  async command(@Req() request: AuthRequest, @Body() body: object): Promise<Snapshot> {
    return this.workspace.execute(request.auth, mutationSchema.parse(body));
  }
}
