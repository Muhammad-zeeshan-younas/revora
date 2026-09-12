import 'dotenv/config';
import 'reflect-metadata';
import { createDatabase } from './data-source';
import { z } from 'zod';

async function migrate(): Promise<void> {
  const database = createDatabase();
  try {
    await database.initialize();
    console.log('Database migrations complete.');
    const runner = database.createQueryRunner();
    try {
      for (const metadata of database.entityMetadatas) {
        const count = await database.getRepository(metadata.target).count();
        console.log(`${metadata.tableName}: ${count} rows`);
      }
      if (database.options.type === 'sqljs') {
        const violations = z
          .array(z.object({ table: z.string(), parent: z.string(), fkid: z.number() }))
          .parse(await runner.query('PRAGMA foreign_key_check'));
        if (violations.length > 0) {
          throw new Error('Foreign-key verification failed.');
        }
      }
    } finally {
      await runner.release();
    }
  } finally {
    if (database.isInitialized) {
      await database.destroy();
    }
  }
}

void migrate().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exitCode = 1;
});
