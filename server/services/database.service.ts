import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createDatabase } from '../database/data-source';
import type { EntityManager } from 'typeorm';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly connection = createDatabase(process.env['TEST_DATABASE'] === 'true');

  private pending: Promise<void> = Promise.resolve();

  async transaction<T>(
    operation: (manager: EntityManager) => Promise<T>,
    consistentRead = false,
  ): Promise<T> {
    if (this.connection.options.type === 'postgres') {
      return consistentRead
        ? this.connection.transaction('REPEATABLE READ', operation)
        : this.connection.transaction(operation);
    }
    // SQL.js has one connection. Serialize transactions so concurrent requests cannot nest them.
    const previous = this.pending;
    let release = (): void => {};
    this.pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.connection.transaction(operation);
    } finally {
      release();
    }
  }

  async onModuleInit(): Promise<void> {
    await this.connection.initialize();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pending;
    if (this.connection.isInitialized) {
      await this.connection.destroy();
    }
  }
}
