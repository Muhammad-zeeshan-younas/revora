import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EmailVerificationEntity } from '../models/email-verification.model';
import { UserEntity } from '../models/user.model';
import { hashToken } from '../utils/password';
import { DatabaseService } from './database.service';
import { EmailService } from './email.service';

const VERIFICATION_DURATION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EmailVerificationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  async verified(userId: string): Promise<boolean> {
    const record = await this.database.transaction(
      (manager) => manager.getRepository(EmailVerificationEntity).findOneBy({ userId }),
      true,
    );

    return Boolean(record?.verifiedAt);
  }

  async request(email: string): Promise<void> {
    if (!this.email.configured())
      {throw new ServiceUnavailableException('Account email is not configured.');}
    const result = await this.database.transaction(async (manager) => {
      const user = await manager.getRepository(UserEntity).findOne({
        where: { email: email.toLowerCase() },
        ...(this.database.connection.options.type === 'postgres'
          ? { lock: { mode: 'pessimistic_write' as const } }
          : {}),
      });
      if (!user) {return null;}
      const repository = manager.getRepository(EmailVerificationEntity);
      const existing = await repository.findOneBy({ userId: user.id });
      if (
        existing?.verifiedAt ||
        (existing?.tokenId && existing.expiresAt > new Date().toISOString())
      )
        {return null;}
      const token = randomBytes(32).toString('hex');
      const tokenId = hashToken(token);
      await repository.save({
        userId: user.id,
        verifiedAt: '',
        tokenId,
        expiresAt: new Date(Date.now() + VERIFICATION_DURATION_MS).toISOString(),
      });

      return { email: user.email, token, tokenId, userId: user.id };
    });
    if (!result) {return;}
    const link = `${process.env['APP_ORIGIN']}/?verify=${result.token}`;
    try {
      await this.email.sendEmailVerification(result.email, link, result.tokenId);
    } catch (error) {
      await this.database.transaction(async (manager) => {
        await manager
          .getRepository(EmailVerificationEntity)
          .update(
            { userId: result.userId, tokenId: result.tokenId },
            { tokenId: '', expiresAt: '' },
          );
      });
      Logger.error(
        error instanceof Error ? error.message : 'Verification email failed.',
        'AccountEmail',
      );
    }
  }

  async complete(token: string): Promise<void> {
    const tokenId = hashToken(token);
    const consumed = await this.database.transaction(async (manager) => {
      const repository = manager.getRepository(EmailVerificationEntity);
      const row = await repository.findOneBy({ tokenId });
      if (!row || row.expiresAt <= new Date().toISOString() || row.verifiedAt) {return false;}
      const updated = await repository.update(
        { userId: row.userId, tokenId, verifiedAt: '' },
        { tokenId: '', expiresAt: '', verifiedAt: new Date().toISOString() },
      );

      return updated.affected === 1;
    });
    if (!consumed) {throw new BadRequestException('Email verification link is invalid or expired.');}
  }
}
