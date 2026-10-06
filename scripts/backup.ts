import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { entities } from '../server/models/entities';

const BACKUP_FILENAME_TIMESTAMP_SEPARATOR_PATTERN = /[:.]/g;

async function backup(): Promise<void> {
  if (process.env['DATABASE_URL']) {
    throw new Error('Use managed PostgreSQL backups for DATABASE_URL deployments.');
  }
  if (!process.argv.includes('--offline-confirmed')) {
    throw new Error('Stop every Revora server, then rerun with --offline-confirmed.');
  }
  let serverResponded = false;
  try {
    await fetch(`http://127.0.0.1:${process.env['PORT'] ?? '3001'}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    serverResponded = true;
  } catch {
    // Connection refused means the default local API is stopped.
  }
  if (serverResponded) {
    throw new Error('A Revora server is still running. Stop it before copying the SQL.js file.');
  }
  const source = resolve('data/revora.sqlite');
  if (!existsSync(source) || statSync(source).size === 0) {
    throw new Error('No local database file was found at data/revora.sqlite.');
  }
  const directory = resolve('data/backups');
  mkdirSync(directory, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replaceAll(BACKUP_FILENAME_TIMESTAMP_SEPARATOR_PATTERN, '-');
  const destination = resolve(
    directory,
    `revora-${stamp}-${randomBytes(4).toString('hex')}.sqlite`,
  );
  copyFileSync(source, destination);
  const database = new DataSource({
    type: 'sqljs',
    location: destination,
    autoSave: false,
    entities,
    synchronize: false,
  });
  try {
    await database.initialize();
    const integrity = (await database.query('PRAGMA integrity_check')) as {
      integrity_check: string;
    }[];
    const foreignKeys = (await database.query('PRAGMA foreign_key_check')) as object[];
    if (integrity[0]?.integrity_check !== 'ok' || foreignKeys.length > 0) {
      throw new Error('Backup failed database integrity checks.');
    }
  } finally {
    if (database.isInitialized) {
      await database.destroy();
    }
  }
  const digest = createHash('sha256').update(readFileSync(destination)).digest('hex');
  writeFileSync(`${destination}.sha256`, `${digest}  ${destination}\n`, { flag: 'wx' });
  console.log(`Verified backup: ${destination}`);
}

void backup().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Backup failed.');
  process.exitCode = 1;
});
