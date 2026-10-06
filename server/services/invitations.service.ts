import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SESSION } from '../../shared/constants';
import { AuditEvent, Role } from '../../shared/enums';
import type { Session } from '../../shared/schema';
import { roleSchema } from '../../shared/schema';
import { AuthRepository } from '../repositories/auth.repository';
import { WorkspaceRepository } from '../repositories/workspace.repository';
import type {
  AcceptInvitationDto,
  CreateInvitationDto,
  InvitationResultDto,
} from '../dto/auth.dto';
import { hashPassword, hashToken } from '../utils/password';
import { EmailService } from './email.service';

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(AuthRepository) private readonly accounts: AuthRepository,
    @Inject(WorkspaceRepository) private readonly workspaces: WorkspaceRepository,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  async create(session: Session, input: CreateInvitationDto): Promise<InvitationResultDto> {
    if (![Role.Owner, Role.Admin].includes(session.user.role)) {
      throw new ForbiddenException();
    }
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION.invitationDurationMs).toISOString();
    const organization = await this.workspaces.findById(session.organizationId);
    organization.data.audit.unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actor: session.user.name,
      action: AuditEvent.MemberInvited,
      detail: `${input.email} invited as ${input.role}`,
      entityId: '',
    });
    await this.accounts.createInvitation(
      {
        id: hashToken(token),
        organizationId: session.organizationId,
        email: input.email.toLowerCase(),
        role: input.role,
        expiresAt,
      },
      organization,
    );

    const link = `${process.env['APP_ORIGIN'] ?? 'http://127.0.0.1:5173'}/?invite=${token}`;
    if (this.email.configured()) {
      try {
        await this.email.sendInvitation(input.email, link, hashToken(token));
      } catch (error) {
        Logger.error(
          error instanceof Error ? error.message : 'Invitation email failed.',
          'AccountEmail',
        );
      }
    }

    return {
      link,
      expiresAt,
    };
  }

  async accept(input: AcceptInvitationDto): Promise<string> {
    const invite = await this.accounts.findInvitation(hashToken(input.token));
    if (!invite || invite.expiresAt < new Date().toISOString()) {
      throw new BadRequestException('Invitation is invalid or expired.');
    }
    if (await this.accounts.findUserByEmail(invite.email)) {
      throw new BadRequestException('This email already has an account.');
    }
    const id = crypto.randomUUID();
    const organization = await this.workspaces.findById(invite.organizationId);
    organization.data.members.push({
      id,
      name: input.name,
      email: invite.email,
      role: roleSchema.parse(invite.role),
    });
    await this.accounts.acceptInvitation(invite.id, organization, {
      id,
      organizationId: invite.organizationId,
      email: invite.email,
      name: input.name,
      passwordHash: hashPassword(input.password),
    });

    return id;
  }
}
