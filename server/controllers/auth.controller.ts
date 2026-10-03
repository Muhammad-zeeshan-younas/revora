import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { loginSchema } from '../../shared/schema';
import type { Session } from '../../shared/schema';
import type { AuthConfigDto, AuthResultDto } from '../dto/auth.dto';
import { AccountsService } from '../services/accounts.service';
import { AuthService } from '../services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get('session')
  async session(@Req() request: Request): Promise<Session> {
    return this.auth.session(request);
  }

  @Get('config')
  config(): AuthConfigDto {
    return this.accounts.config();
  }

  @Post('login')
  async login(
    @Body() body: object,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResultDto> {
    const userId = await this.accounts.login(loginSchema.parse(body));
    await this.auth.issue(userId, response);

    return { ok: true };
  }

  @Post('demo')
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
