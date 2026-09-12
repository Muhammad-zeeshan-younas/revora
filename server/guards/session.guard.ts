import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { AuthService } from '../services/auth.service';
import type { AuthRequest } from '../interfaces/auth-request.interface';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.auth = await this.auth.session(request);

    return true;
  }
}
