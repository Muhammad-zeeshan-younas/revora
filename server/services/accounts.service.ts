import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Role } from '../../shared/enums';
import { createDemo, emptyWorkspace } from '../../shared/seed';
import { AuthRepository } from '../repositories/auth.repository';
import type { AuthConfigDto, LoginDto, RegisterDto } from '../dto/auth.dto';
import { hashPassword, verifyPassword } from '../utils/password';

@Injectable()
export class AccountsService {
  constructor(@Inject(AuthRepository) private readonly accounts: AuthRepository) {}

  config(): AuthConfigDto {
    return {
      demoEnabled:
        process.env['DEMO_ENABLED'] === 'true' && process.env['NODE_ENV'] !== 'production',
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

    return user.id;
  }

  async register(input: RegisterDto): Promise<string> {
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
