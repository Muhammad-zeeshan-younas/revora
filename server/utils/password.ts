import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashPassword(value: string): string {
  const salt = randomBytes(16).toString('hex');

  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}

export function verifyPassword(value: string, encoded: string): boolean {
  const [salt, hash] = encoded.split(':');
  if (!salt || !hash) {
    return false;
  }
  const candidate = scryptSync(value, salt, 64);
  const expected = Buffer.from(hash, 'hex');

  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
