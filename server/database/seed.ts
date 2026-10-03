import 'dotenv/config';
import 'reflect-metadata';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { createDatabase } from './data-source';
import { DEVELOPMENT_PASSWORD, developmentAccounts } from './development-fixtures';
import {
  DevelopmentSeedResult,
  seedDevelopmentRecords,
} from '../repositories/development-seed.repository';

async function reserveApiPort(): Promise<Server> {
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', () =>
      reject(
        new Error(
          'Stop yarn dev (or the backend) before running yarn db:seed. The API port is busy.',
        ),
      ),
    );
    server.listen(Number(process.env['PORT'] ?? 3001), '127.0.0.1', resolve);
  });

  return server;
}

async function seed(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'development') {
    throw new Error(
      'Dummy accounts require NODE_ENV=development. Do not seed production databases.',
    );
  }
  // SQL.js loads a file into memory: a second writer could overwrite a running API's changes.
  const portReservation = await reserveApiPort();
  try {
    const database = createDatabase();
    try {
      await database.initialize();
      const result = await database.transaction((manager) => seedDevelopmentRecords(manager));
      console.log(
        result === DevelopmentSeedResult.Created
          ? 'Created two demo workspaces and seven login accounts.'
          : 'Demo workspaces already exist. Your records, roles, and passwords were left unchanged.',
      );
      if (result === DevelopmentSeedResult.Created) {
        console.table(developmentAccounts.map(({ email, role }) => ({ email, role })));
        console.log(`Development password for all seeded accounts: ${DEVELOPMENT_PASSWORD}`);
      }
      console.log(
        'See SEED_GUIDE.md for permissions and manual scenarios. Start the app with yarn dev.',
      );
    } finally {
      if (database.isInitialized) {
        await database.destroy();
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      portReservation.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

void seed().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Development seed failed.');
  process.exitCode = 1;
});
