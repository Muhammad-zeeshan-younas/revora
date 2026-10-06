const MFA_KEY_PATTERN = /^[a-fA-F0-9]{64}$/;

export function validateProductionEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env['NODE_ENV'] !== 'production') {
    return;
  }

  const missing: string[] = [];
  for (const name of [
    'DATABASE_URL',
    'APP_ORIGIN',
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'MFA_ENCRYPTION_KEY',
    'OPERATIONS_TOKEN',
  ]) {
    if (!env[name]?.trim()) {
      missing.push(name);
    }
  }
  if (missing.length) {
    throw new Error(`Production configuration is missing: ${missing.join(', ')}.`);
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(env['DATABASE_URL']!);
  } catch {
    throw new Error('Production DATABASE_URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('Production DATABASE_URL must use PostgreSQL.');
  }
  let appOrigin: URL;
  try {
    appOrigin = new URL(env['APP_ORIGIN']!);
  } catch {
    throw new Error('Production APP_ORIGIN is invalid.');
  }
  if (appOrigin.protocol !== 'https:' || appOrigin.origin !== env['APP_ORIGIN']) {
    throw new Error('Production APP_ORIGIN must be an HTTPS origin without a path.');
  }
  if (!MFA_KEY_PATTERN.test(env['MFA_ENCRYPTION_KEY']!)) {
    throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes encoded as 64 hexadecimal characters.');
  }
  if (env['OPERATIONS_TOKEN']!.length < 32) {
    throw new Error('OPERATIONS_TOKEN must contain at least 32 characters.');
  }
  if (!/^.+\s<[^<>\s@]+@[^<>\s@]+>$|^[^<>\s@]+@[^<>\s@]+$/.test(env['EMAIL_FROM']!)) {
    throw new Error('EMAIL_FROM must contain a valid sender address.');
  }
}
