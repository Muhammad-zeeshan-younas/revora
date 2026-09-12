import { Body, Controller, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { acceptInviteSchema, inviteSchema } from '../../shared/schema';
import type { AuthResultDto, InvitationResultDto } from '../dto/auth.dto';
import type { AuthRequest } from '../interfaces/auth-request.interface';
import { SessionGuard } from '../guards/session.guard';
import { AuthService } from '../services/auth.service';
import { InvitationsService } from '../services/invitations.service';

@Controller('auth')
export class InvitationsController {
  constructor(
    @Inject(InvitationsService) private readonly invitations: InvitationsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post('invite')
  @UseGuards(SessionGuard)
  async create(@Req() request: AuthRequest, @Body() body: object): Promise<InvitationResultDto> {
    return this.invitations.create(request.auth, inviteSchema.parse(body));
  }

  @Post('accept-invite')
  async accept(
    @Body() body: object,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResultDto> {
    const userId = await this.invitations.accept(acceptInviteSchema.parse(body));
    await this.auth.issue(userId, response);

    return { ok: true };
  }
}
