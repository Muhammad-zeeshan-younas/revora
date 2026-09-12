import { SESSION } from '../../shared/constants';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { randomBytes } from 'node:crypto';

import type { Request, Response } from 'express';

import { AuthRepository } from '../repositories/auth.repository';
import { WorkspaceRepository } from '../repositories/workspace.repository';

import type { Session } from '../../shared/schema';

import { hashToken } from '../utils/password';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthRepository) private readonly accounts: AuthRepository,
    @Inject(WorkspaceRepository) private readonly workspaces: WorkspaceRepository,
  ) {}

  async session(request: Request): Promise<Session> {
    const cookie = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION.cookieName}=`))
      ?.slice(SESSION.cookieName.length + 1);
    if (!cookie) {
      throw new UnauthorizedException('Please sign in to continue.');
    }
    const session = await this.accounts.findSession(hashToken(cookie));
    if (!session || session.expiresAt < new Date().toISOString()) {
      throw new UnauthorizedException('Your session expired. Please sign in.');
    }
    const user = await this.accounts.findUserById(session.userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    const organization = await this.workspaces.findById(user.organizationId);
    const member = organization.data.members.find((item) => item.id === user.id);
    if (!member) {
      throw new UnauthorizedException();
    }

    return { user: member, organizationId: organization.id, demo: session.demo };
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
    const cookie = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION.cookieName}=`))
      ?.slice(SESSION.cookieName.length + 1);
    if (cookie) {
      await this.accounts.deleteSession(hashToken(cookie));
    }
    response.clearCookie(SESSION.cookieName, { path: '/' });
  }
}
