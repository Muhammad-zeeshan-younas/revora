import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  loginSchema,
  passwordResetCompleteSchema,
  passwordResetRequestSchema,
} from '../../shared/schema';
import type { Session } from '../../shared/schema';
import type { AuthConfigDto, AuthResultDto } from '../dto/auth.dto';
import { AccountsService } from '../services/accounts.service';
import { AuthService } from '../services/auth.service';
import { MfaService } from '../services/mfa.service';
import { EmailVerificationService } from '../services/email-verification.service';
import { MonitoringService } from '../services/monitoring.service';
import { SecurityEventKind } from '../models/security-event.model';
import { UnauthorizedException } from '@nestjs/common';
import { SessionGuard } from '../guards/session.guard';
import type { AuthRequest } from '../interfaces/auth-request.interface';
import { z } from 'zod';

const mfaPasswordSchema = z.object({ password: z.string().min(1).max(128) });
const AUTHENTICATOR_CODE_PATTERN = /^\d{6}$/;
const mfaCodeSchema = z.object({ code: z.string().regex(AUTHENTICATOR_CODE_PATTERN) });
const mfaDisableSchema = mfaPasswordSchema.extend({ code: mfaCodeSchema.shape.code });
const emailVerificationRequestSchema = z.object({ email: z.email() });
const emailVerificationCompleteSchema = z.object({ token: z.string().min(32).max(128) });

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(EmailVerificationService) private readonly emailVerification: EmailVerificationService,
    @Inject(MonitoringService) private readonly monitoring: MonitoringService,
  ) {}

  @Get('session')
  async session(@Req() request: Request): Promise<Session> {
    return this.auth.session(request);
  }

  @Get('email-verification/status')
  @UseGuards(SessionGuard)
  async emailVerificationStatus(
    @Req() request: AuthRequest,
  ): Promise<{ verified: boolean; available: boolean }> {
    return {
      verified: await this.emailVerification.verified(request.auth.user.id),
      available: this.accounts.config().passwordResetEnabled,
    };
  }

  @Post('email-verification/request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestEmailVerification(@Body() body: object): Promise<AuthResultDto> {
    await this.emailVerification.request(emailVerificationRequestSchema.parse(body).email);

    return { ok: true };
  }

  @Post('email-verification/complete')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async completeEmailVerification(@Body() body: object): Promise<AuthResultDto> {
    await this.emailVerification.complete(emailVerificationCompleteSchema.parse(body).token);

    return { ok: true };
  }

  @Get('config')
  config(): AuthConfigDto {
    return this.accounts.config();
  }

  @Post('login')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async login(
    @Body() body: object,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResultDto> {
    const input = loginSchema.parse(body);
    let userId: string;
    try {
      userId = await this.accounts.login(input);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.monitoring.securityEvent(SecurityEventKind.PasswordRejected, input.email);
      }
      throw error;
    }
    let mfaRequired: boolean;
    try {
      mfaRequired = await this.mfa.verifyLogin(userId, input.code);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.monitoring.securityEvent(SecurityEventKind.AuthenticatorRejected, input.email);
      }
      throw error;
    }
    if (mfaRequired) {
      return { ok: false, mfaRequired: true };
    }
    await this.auth.issue(userId, response);

    return { ok: true };
  }

  @Get('mfa')
  @UseGuards(SessionGuard)
  mfaStatus(@Req() request: AuthRequest) {
    return this.mfa.status(request.auth.user.id);
  }

  @Post('mfa/begin')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  mfaBegin(@Req() request: AuthRequest, @Body() body: object) {
    return this.mfa.begin(request.auth, mfaPasswordSchema.parse(body).password);
  }

  @Post('mfa/confirm')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async mfaConfirm(@Req() request: AuthRequest, @Body() body: object): Promise<AuthResultDto> {
    await this.mfa.confirm(request.auth, mfaCodeSchema.parse(body).code);

    return { ok: true };
  }

  @Post('mfa/disable')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async mfaDisable(@Req() request: AuthRequest, @Body() body: object): Promise<AuthResultDto> {
    const input = mfaDisableSchema.parse(body);
    await this.mfa.disable(request.auth, input.password, input.code);

    return { ok: true };
  }

  @Post('password-reset/request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestPasswordReset(@Body() body: object): Promise<AuthResultDto> {
    await this.accounts.requestPasswordReset(passwordResetRequestSchema.parse(body).email);

    return { ok: true };
  }

  @Post('password-reset/complete')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async completePasswordReset(@Body() body: object): Promise<AuthResultDto> {
    const input = passwordResetCompleteSchema.parse(body);
    await this.accounts.completePasswordReset(input.token, input.password);

    return { ok: true };
  }

  @Post('demo')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async demo(@Res({ passthrough: true }) response: Response): Promise<AuthResultDto> {
    const userId = await this.accounts.createDemo();
    await this.auth.issue(userId, response, true);

    return { ok: true };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResultDto> {
    await this.auth.logout(request, response);

    return { ok: true };
  }
}
