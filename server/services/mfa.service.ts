import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { LessThan } from 'typeorm';
import type { Session } from '../../shared/schema';
import { UserMfaEntity } from '../models/user-mfa.model';
import { UserEntity } from '../models/user.model';
import { verifyPassword } from '../utils/password';
import { DatabaseService } from './database.service';

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW_STEPS = [-1, 0, 1];
const TOTP_CODE_PATTERN = /^\d{6}$/;
const ENCRYPTION_KEY_PATTERN = /^[a-fA-F0-9]{64}$/;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PENDING_DURATION_MS = 10 * 60 * 1000;

function encryptionKey(): Buffer {
  const value = process.env['MFA_ENCRYPTION_KEY'] ?? '';
  if (!ENCRYPTION_KEY_PATTERN.test(value)) {
    throw new ServiceUnavailableException('MFA encryption is not configured.');
  }

  return Buffer.from(value, 'hex');
}

function encrypt(secret: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);

  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.');
}

function decrypt(value: string): Buffer {
  const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part ?? '', 'base64'));
  if (!iv || !tag || !ciphertext) {throw new ServiceUnavailableException('MFA data is unavailable.');}
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function base32(secret: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of secret) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) {output += BASE32_ALPHABET[(value << (5 - bits)) & 31];}

  return output;
}

function codeAt(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  const truncated = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP_DIGITS;

  return String(truncated).padStart(TOTP_DIGITS, '0');
}

function matchedStep(secret: Buffer, code: string): number | null {
  if (!TOTP_CODE_PATTERN.test(code)) {return null;}
  const nowStep = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  for (const offset of TOTP_WINDOW_STEPS) {
    const step = nowStep + offset;
    if (timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(code))) {return step;}
  }

  return null;
}

@Injectable()
export class MfaService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async status(userId: string): Promise<{ enabled: boolean; available: boolean }> {
    const row = await this.database.transaction(
      (manager) => manager.getRepository(UserMfaEntity).findOneBy({ userId }),
      true,
    );

    return {
      enabled: Boolean(row?.secretCiphertext),
      available: ENCRYPTION_KEY_PATTERN.test(process.env['MFA_ENCRYPTION_KEY'] ?? ''),
    };
  }

  async begin(session: Session, password: string): Promise<{ secret: string; uri: string }> {
    encryptionKey();

    return this.database.transaction(async (manager) => {
      const user = await manager.getRepository(UserEntity).findOneBy({ id: session.user.id });
      if (!user || !verifyPassword(password, user.passwordHash))
        {throw new ForbiddenException('Password is incorrect.');}
      const repository = manager.getRepository(UserMfaEntity);
      const existing = await repository.findOneBy({ userId: user.id });
      if (existing?.secretCiphertext) {throw new BadRequestException('MFA is already enabled.');}
      const secret = randomBytes(20);
      const pendingCiphertext = encrypt(secret);
      await repository.save({
        userId: user.id,
        secretCiphertext: '',
        pendingCiphertext,
        pendingExpiresAt: new Date(Date.now() + PENDING_DURATION_MS).toISOString(),
        lastUsedStep: -1,
      });
      const encoded = base32(secret);
      const label = encodeURIComponent(`Revora:${user.email}`);
      const uri = `otpauth://totp/${label}?secret=${encoded}&issuer=Revora&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;

      return { secret: encoded, uri };
    });
  }

  async confirm(session: Session, code: string): Promise<void> {
    await this.database.transaction(async (manager) => {
      const repository = manager.getRepository(UserMfaEntity);
      const row = await repository.findOneBy({ userId: session.user.id });
      if (!row?.pendingCiphertext || row.pendingExpiresAt <= new Date().toISOString()) {
        throw new BadRequestException('MFA setup has expired. Start again.');
      }
      const step = matchedStep(decrypt(row.pendingCiphertext), code);
      if (step === null) {throw new BadRequestException('Authenticator code is incorrect.');}
      const result = await repository.update(
        { userId: session.user.id, pendingCiphertext: row.pendingCiphertext, secretCiphertext: '' },
        {
          secretCiphertext: row.pendingCiphertext,
          pendingCiphertext: '',
          pendingExpiresAt: '',
          lastUsedStep: step,
        },
      );
      if (result.affected !== 1) {throw new BadRequestException('MFA setup changed. Start again.');}
    });
  }

  async verifyLogin(userId: string, code?: string): Promise<boolean> {
    return this.database.transaction(async (manager) => {
      const repository = manager.getRepository(UserMfaEntity);
      const row = await repository.findOneBy({ userId });
      if (!row?.secretCiphertext) {return false;}
      if (!code) {return true;}
      const step = matchedStep(decrypt(row.secretCiphertext), code);
      if (step === null) {throw new UnauthorizedException('Authenticator code is incorrect.');}
      const claimed = await repository.update(
        { userId, lastUsedStep: LessThan(step) },
        { lastUsedStep: step },
      );
      if (claimed.affected !== 1)
        {throw new UnauthorizedException(
          'Authenticator code was already used. Wait for a new code.',
        );}

      return false;
    });
  }

  async disable(session: Session, password: string, code: string): Promise<void> {
    await this.database.transaction(async (manager) => {
      const user = await manager.getRepository(UserEntity).findOneBy({ id: session.user.id });
      if (!user || !verifyPassword(password, user.passwordHash))
        {throw new ForbiddenException('Password is incorrect.');}
      const repository = manager.getRepository(UserMfaEntity);
      const row = await repository.findOneBy({ userId: user.id });
      if (!row?.secretCiphertext) {throw new BadRequestException('MFA is not enabled.');}
      const step = matchedStep(decrypt(row.secretCiphertext), code);
      if (step === null || step <= row.lastUsedStep)
        {throw new ForbiddenException('Authenticator code is incorrect or already used.');}
      await repository.delete({
        userId: user.id,
        secretCiphertext: row.secretCiphertext,
        lastUsedStep: row.lastUsedStep,
      });
    });
  }
}
