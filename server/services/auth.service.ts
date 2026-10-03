import { SESSION } from '../../shared/constants';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { randomBytes } from 'node:crypto';

import type { Request, Response } from 'express';

import { AuthRepository } from '../repositories/auth.repository';

import type { Session } from '../../shared/schema';

import { hashToken } from '../utils/password';
import { readCookie } from '../utils/cookies';

@Injectable()
export class AuthService {
  constructor(@Inject(AuthRepository) private readonly accounts: AuthRepository) {}

  async session(request: Request): Promise<Session> {
    const cookie = readCookie(request.headers.cookie, SESSION.cookieName);
    if (!cookie) {
      throw new UnauthorizedException('Please sign in to continue.');
    }
    const session = await this.accounts.findAuthenticatedSession(
      hashToken(cookie),
      new Date().toISOString(),
    );
    if (!session) {
      throw new UnauthorizedException('Your session expired. Please sign in.');
    }

    return session;
  }

  async issue(userId: string, response: Response, demo = false): Promise<void> {
    const token = randomBytes(32).toString('hex');
    await this.accounts.saveSession({
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION.durationMs).toISOString(),
      demo,
    });
    response.cookie(SESSION.cookieName, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env['NODE_ENV'] === 'production',
      maxAge: SESSION.durationMs,
      path: '/',
    });
  }

  async logout(request: Request, response: Response): Promise<void> {
    const cookie = readCookie(request.headers.cookie, SESSION.cookieName);
    if (cookie) {
      await this.accounts.deleteSession(hashToken(cookie));
    }
    response.clearCookie(SESSION.cookieName, { path: '/' });
  }
}
