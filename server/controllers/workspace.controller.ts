import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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

  @Get('overview')
  overview(@Req() request: AuthRequest) {
    return this.workspace.overview(request.auth);
  }

  @Get('bootstrap')
  bootstrap(@Req() request: AuthRequest): Promise<Snapshot> {
    return this.workspace.bootstrap(request.auth);
  }

  @Get('records/:kind')
  records(@Req() request: AuthRequest, @Param('kind') kind: string, @Query() query: object) {
    return this.workspace.records(request.auth, kind, query);
  }

  @Post('commands')
  async command(@Req() request: AuthRequest, @Body() body: object): Promise<Snapshot> {
    return this.workspace.execute(request.auth, mutationSchema.parse(body));
  }

  @Get('bank-import-profiles')
  bankImportProfiles(@Req() request: AuthRequest) {
    return this.workspace.bankImportProfiles(request.auth);
  }

  @Post('bank-import-profiles')
  saveBankImportProfile(@Req() request: AuthRequest, @Body() body: object) {
    return this.workspace.saveBankImportProfile(request.auth, body);
  }

  @Get('territories')
  territories(@Req() request: AuthRequest) {
    return this.workspace.territories(request.auth);
  }

  @Post('territories')
  assignTerritory(@Req() request: AuthRequest, @Body() body: object) {
    return this.workspace.assignTerritory(request.auth, body);
  }

  @Get('whatsapp-deliveries')
  whatsappDeliveries(@Req() request: AuthRequest) {
    return this.workspace.whatsappDeliveries(request.auth);
  }

  @Post('whatsapp-deliveries/:jobId/retry')
  retryWhatsAppDelivery(@Req() request: AuthRequest, @Param('jobId') jobId: string) {
    return this.workspace.retryWhatsAppDelivery(request.auth, jobId);
  }

  @Get('whatsapp-consents')
  whatsAppConsents(@Req() request: AuthRequest) {
    return this.workspace.whatsAppConsents(request.auth);
  }

  @Post('whatsapp-consents')
  setWhatsAppConsent(@Req() request: AuthRequest, @Body() body: object) {
    return this.workspace.setWhatsAppConsent(request.auth, body);
  }
}
