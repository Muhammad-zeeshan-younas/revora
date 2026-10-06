import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Role } from '../../shared/enums';
import { SESSION } from '../../shared/constants';
import { createDemo, emptyWorkspace } from '../../shared/seed';
import { AuthRepository } from '../repositories/auth.repository';
import type { AuthConfigDto, LoginDto, CreateCompanyDto } from '../dto/auth.dto';
import { hashPassword, verifyPassword } from '../utils/password';
import { hashToken } from '../utils/password';
import { EmailService } from './email.service';
import { EmailVerificationService } from './email-verification.service';

@Injectable()
export class AccountsService {
  constructor(
    @Inject(AuthRepository) private readonly accounts: AuthRepository,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(EmailVerificationService) private readonly emailVerification: EmailVerificationService,
  ) {}

  config(): AuthConfigDto {
    return {
      demoEnabled:
        process.env['DEMO_ENABLED'] === 'true' && process.env['NODE_ENV'] !== 'production',
      passwordResetEnabled: this.email.configured(),
    };
  }

  async login(input: LoginDto): Promise<string> {
    const user = await this.accounts.findUserByEmail(input.email.toLowerCase());
    const valid = verifyPassword(
      input.password,
      user?.passwordHash ?? `invalid:${'0'.repeat(128)}`,
    );
    if (!user || !valid) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    if (this.email.configured() && !(await this.emailVerification.verified(user.id))) {
      await this.emailVerification.request(user.email);
      throw new ForbiddenException(
        'Verify your email using the link sent to your inbox before signing in.',
      );
    }

    return user.id;
  }

  async requestPasswordReset(email: string): Promise<void> {
    if (!this.email.configured()) {
      throw new ServiceUnavailableException('Account email is not configured.');
    }
    const user = await this.accounts.findUserByEmail(email.toLowerCase());
    if (!user) {
      return;
    }
    const token = randomBytes(32).toString('hex');
    const id = hashToken(token);
    await this.accounts.savePasswordReset(
      id,
      user.id,
      new Date(Date.now() + SESSION.passwordResetDurationMs).toISOString(),
    );
    const link = `${process.env['APP_ORIGIN'] ?? 'http://127.0.0.1:5173'}/?reset=${token}`;
    try {
      await this.email.sendPasswordReset(user.email, link, id);
    } catch (error) {
      await this.accounts.deletePasswordReset(id);
      Logger.error(
        error instanceof Error ? error.message : 'Password reset email failed.',
        'AccountEmail',
      );
    }
  }

  async completePasswordReset(token: string, password: string): Promise<void> {
    const consumed = await this.accounts.consumePasswordReset(
      hashToken(token),
      hashPassword(password),
      new Date().toISOString(),
    );
    if (!consumed) {
      throw new BadRequestException('Password reset link is invalid or expired.');
    }
  }

  /** Internal company provisioning. This operation has no public HTTP route. */
  async createCompany(input: CreateCompanyDto): Promise<string> {
    const email = input.email.toLowerCase();
    if (await this.accounts.findUserByEmail(email)) {
      throw new BadRequestException('An account already exists for this email.');
    }
    const organizationId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const data = emptyWorkspace(organizationId, input.organization);
    data.members.push({ id: userId, name: input.name, email, role: Role.Owner });
    await this.accounts.createAccount(
      { id: organizationId, data, revision: 0 },
      {
        id: userId,
        organizationId,
        email,
        passwordHash: hashPassword(input.password),
        name: input.name,
      },
    );

    return userId;
  }

  async createDemo(): Promise<string> {
    if (!this.config().demoEnabled) {
      throw new ForbiddenException('Demo access is disabled.');
    }
    const organizationId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const data = createDemo(organizationId);
    const email = `demo-${userId}@example.com`;
    const name = 'Hassan Ahmed';
    data.members.push({ id: userId, name, email, role: Role.Owner });
    await this.accounts.createAccount(
      { id: organizationId, data, revision: 0 },
      {
        id: userId,
        organizationId,
        email,
        passwordHash: hashPassword(randomBytes(32).toString('hex')),
        name,
      },
    );

    return userId;
  }
}
