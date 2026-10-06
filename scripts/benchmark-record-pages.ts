import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { DataSource } from 'typeorm';
import { CustomerStatus, InvoiceStatus } from '../shared/enums';
import { RecordKind } from '../shared/record-query';
import { emptyWorkspace } from '../shared/seed';
import { CustomerEntity } from '../server/models/customer.model';
import { InvoiceEntity } from '../server/models/invoice.model';
import { OrganizationEntity } from '../server/models/organization.model';
import { WorkspaceSettingsEntity } from '../server/models/workspace-settings.model';
import { WorkspaceRepository } from '../server/repositories/workspace.repository';
import { DatabaseService } from '../server/services/database.service';

const ORGANIZATION_ID = 'benchmark-company';
const CUSTOMER_COUNT = 5_000;
const INVOICES_PER_CUSTOMER = 5;
const INSERT_BATCH_SIZE = 50;
const RECORD_PAGE_SIZE = 25;
const SAMPLE_COUNT = 20;

function percentile(values: number[], percentage: number): number {
  const sorted = [...values].sort((left, right) => left - right);

  return (
    sorted[Math.min(sorted.length - 1, Math.ceil((percentage / 100) * sorted.length) - 1)] ?? 0
  );
}

async function main(): Promise<void> {
  const postgres = process.argv.includes('--postgres');
  const previousTestDatabase = process.env['TEST_DATABASE'];
  const previousDatabaseUrl = process.env['DATABASE_URL'];
  if (postgres) {
    const value = process.env['BENCHMARK_DATABASE_URL'];
    if (!value) {
      throw new Error('Set BENCHMARK_DATABASE_URL for an isolated PostgreSQL benchmark database.');
    }
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.pathname.toLowerCase().includes('benchmark')
    ) {
      throw new Error(
        'BENCHMARK_DATABASE_URL must point to a PostgreSQL database named for benchmarking.',
      );
    }
    const guard = new DataSource({
      type: 'postgres',
      url: value,
      synchronize: false,
      migrationsRun: false,
    });
    await guard.initialize();
    try {
      const rows = (await guard.query(
        "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'",
      )) as { count: string | number }[];
      if (Number(rows[0]?.count ?? 0) !== 0) {
        throw new Error('Benchmark PostgreSQL database must have no existing tables.');
      }
    } finally {
      await guard.destroy();
    }
    process.env['DATABASE_URL'] = value;
    delete process.env['TEST_DATABASE'];
  } else {
    process.env['TEST_DATABASE'] = 'true';
  }
  const database = new DatabaseService();
  await database.onModuleInit();
  const repository = new WorkspaceRepository(database);
  const workspace = emptyWorkspace(ORGANIZATION_ID, 'Benchmark Company');

  try {
    await database.transaction(async (manager) => {
      await manager
        .getRepository(OrganizationEntity)
        .insert({ ...workspace.organization, revision: 0 });
      await manager
        .getRepository(WorkspaceSettingsEntity)
        .insert({ ...workspace.settings, organizationId: ORGANIZATION_ID });

      for (let start = 0; start < CUSTOMER_COUNT; start += INSERT_BATCH_SIZE) {
        const end = Math.min(CUSTOMER_COUNT, start + INSERT_BATCH_SIZE);
        const customers = Array.from({ length: end - start }, (_, offset) => {
          const index = start + offset;
          const id = `customer-${index}`;
          const name = `Customer ${String(index).padStart(5, '0')}`;

          return {
            organizationId: ORGANIZATION_ID,
            id,
            sortOrder: index,
            name,
            nameKey: name.toLowerCase(),
            contact: 'Account Manager',
            email: `customer-${index}@example.com`,
            phone: '+923001234567',
            city: 'Lahore',
            taxId: '',
            salesperson: 'Sales Team',
            creditLimit: 10_000_000,
            terms: 30,
            status: CustomerStatus.Active,
          };
        });
        await manager.getRepository(CustomerEntity).insert(customers);
      }

      for (
        let start = 0;
        start < CUSTOMER_COUNT * INVOICES_PER_CUSTOMER;
        start += INSERT_BATCH_SIZE
      ) {
        const end = Math.min(CUSTOMER_COUNT * INVOICES_PER_CUSTOMER, start + INSERT_BATCH_SIZE);
        const invoices = Array.from({ length: end - start }, (_, offset) => {
          const index = start + offset;
          const number = `BENCH-${index}`;

          return {
            organizationId: ORGANIZATION_ID,
            id: `invoice-${index}`,
            sortOrder: index,
            number,
            numberKey: number.toLowerCase(),
            customerId: `customer-${Math.floor(index / INVOICES_PER_CUSTOMER)}`,
            issuedAt: '2026-09-01',
            dueAt: '2026-10-01',
            amount: 100_000,
            paid: 0,
            status: InvoiceStatus.Open as const,
            reference: '',
          };
        });
        await manager.getRepository(InvoiceEntity).insert(invoices);
      }
    });

    const timings: number[] = [];
    for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
      const started = performance.now();
      await repository.listRecords(ORGANIZATION_ID, RecordKind.Invoices, {
        cursor: sample * RECORD_PAGE_SIZE - 1,
        limit: RECORD_PAGE_SIZE,
        search: '',
        status: '',
      });
      timings.push(performance.now() - started);
    }
    const snapshotStarted = performance.now();
    const snapshot = await repository.findById(ORGANIZATION_ID);
    const snapshotTime = performance.now() - snapshotStarted;
    const snapshotBytes = Buffer.byteLength(JSON.stringify(snapshot.data));

    process.stdout.write(
      JSON.stringify(
        {
          storage: postgres ? 'isolated PostgreSQL' : 'in-memory SQL.js',
          customers: CUSTOMER_COUNT,
          invoices: CUSTOMER_COUNT * INVOICES_PER_CUSTOMER,
          pageSize: RECORD_PAGE_SIZE,
          pageLatencyMs: {
            p50: Number(percentile(timings, 50).toFixed(1)),
            p95: Number(percentile(timings, 95).toFixed(1)),
          },
          fullSnapshot: {
            milliseconds: Number(snapshotTime.toFixed(1)),
            megabytes: Number((snapshotBytes / 1_000_000).toFixed(2)),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await database.onModuleDestroy();
    if (previousTestDatabase === undefined) {
      delete process.env['TEST_DATABASE'];
    } else {
      process.env['TEST_DATABASE'] = previousTestDatabase;
    }
    if (previousDatabaseUrl === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = previousDatabaseUrl;
    }
  }
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
