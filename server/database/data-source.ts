import { mkdirSync } from 'node:fs';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { entities } from '../models/entities';
import { NormalizeWorkspace1789200000000 } from '../migrations/1789200000000-normalize-workspace';

export function createDatabase(memory = false): DataSource {
  const migrations = [NormalizeWorkspace1789200000000];
  const url = process.env['DATABASE_URL'];
  if (url && !memory) {
    return new DataSource({
      type: 'postgres',
      url,
      entities,
      synchronize: false,
      migrations,
      migrationsRun: true,
      migrationsTransactionMode: 'all',
      logging: ['error'],
    });
  }
  if (!memory) {
    mkdirSync('data', { recursive: true });
  }

  return new DataSource({
    type: 'sqljs',
    entities,
    synchronize: false,
    migrations,
    migrationsRun: true,
    migrationsTransactionMode: 'all',
    autoSave: !memory,
    ...(memory ? {} : { location: 'data/revora.sqlite' }),
    logging: ['error'],
  });
}
