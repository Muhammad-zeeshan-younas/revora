import { Controller, Get, Inject, Param, Req, UseGuards } from '@nestjs/common';
import type { AuthRequest } from '../interfaces/auth-request.interface';
import { SessionGuard } from '../guards/session.guard';
import { ManagementReportsService } from '../services/management-reports.service';

@Controller('workspace/reports')
@UseGuards(SessionGuard)
export class ManagementReportsController {
  constructor(
    @Inject(ManagementReportsService) private readonly reports: ManagementReportsService,
  ) {}

  @Get()
  history(@Req() request: AuthRequest) {
    return this.reports.history(request.auth);
  }

  @Get(':month')
  get(@Req() request: AuthRequest, @Param('month') month: string) {
    return this.reports.get(request.auth, month);
  }
}
