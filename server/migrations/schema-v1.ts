import type { TableOptions } from 'typeorm';

// Frozen schema for the first relational migration. Future changes require a new migration.
export const relationalTablesV1: TableOptions[] = [
  {
    name: 'organizations',
    columns: [
      {
        name: 'id',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'name',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'currency',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'timezone',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'revision',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [],
    uniques: [],
    indices: [],
    checks: [
      {
        expression: '"revision" >= 0',
      },
    ],
  },
  {
    name: 'users',
    columns: [
      {
        name: 'id',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'email',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'passwordHash',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'name',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [
      {
        name: 'uq_users_0',
        columnNames: ['email'],
      },
      {
        name: 'uq_users_1',
        columnNames: ['organizationId', 'id'],
      },
    ],
    indices: [],
    checks: [],
  },
  {
    name: 'sessions',
    columns: [
      {
        name: 'id',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'userId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'expiresAt',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'demo',
        type: 'boolean',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [],
    indices: [
      {
        name: 'ix_sessions_0',
        columnNames: ['userId'],
      },
      {
        name: 'ix_sessions_1',
        columnNames: ['expiresAt'],
      },
    ],
    checks: [],
  },
  {
    name: 'invitations',
    columns: [
      {
        name: 'id',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'email',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'role',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'expiresAt',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [],
    indices: [
      {
        name: 'ix_invitations_0',
        columnNames: ['organizationId'],
      },
      {
        name: 'ix_invitations_1',
        columnNames: ['expiresAt'],
      },
    ],
    checks: [
      {
        expression: "\"role\" IN ('Admin', 'Accountant', 'Collections', 'Sales', 'Viewer')",
      },
    ],
  },
  {
    name: 'members',
    columns: [
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'userId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'role',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'sortOrder',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
      {
        columnNames: ['organizationId', 'userId'],
        referencedColumnNames: ['organizationId', 'id'],
        referencedTableName: 'users',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [],
    indices: [],
    checks: [
      {
        expression:
          "\"role\" IN ('Owner', 'Admin', 'Accountant', 'Collections', 'Sales', 'Viewer')",
      },
    ],
  },
  {
    name: 'workspace_settings',
    columns: [
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'remindersEnabled',
        type: 'boolean',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'reminderHour',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'dailyLimit',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'template',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [],
    indices: [],
    checks: [
      {
        expression: '"reminderHour" BETWEEN 8 AND 18',
      },
      {
        expression: '"dailyLimit" BETWEEN 1 AND 100',
      },
    ],
  },
  {
    name: 'customers',
    columns: [
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'id',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'sortOrder',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'name',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'nameKey',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'contact',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'email',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'phone',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'city',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'taxId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'salesperson',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'creditLimit',
        type: 'bigint',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'terms',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'status',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [
      {
        name: 'uq_customers_0',
        columnNames: ['organizationId', 'nameKey'],
      },
    ],
    indices: [],
    checks: [
      {
        expression: '"terms" BETWEEN 0 AND 365',
      },
      {
        expression: "\"status\" IN ('Active', 'On hold')",
      },
      {
        expression: '"creditLimit" BETWEEN 0 AND 1000000000000',
      },
    ],
  },
  {
    name: 'invoices',
    columns: [
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'id',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'sortOrder',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'number',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'numberKey',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'customerId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'issuedAt',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'dueAt',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'amount',
        type: 'bigint',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'paid',
        type: 'bigint',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'status',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'reference',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
      {
        columnNames: ['organizationId', 'customerId'],
        referencedColumnNames: ['organizationId', 'id'],
        referencedTableName: 'customers',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [
      {
        name: 'uq_invoices_0',
        columnNames: ['organizationId', 'numberKey'],
      },
      {
        name: 'uq_invoices_1',
        columnNames: ['organizationId', 'id', 'customerId'],
      },
    ],
    indices: [
      {
        name: 'ix_invoices_0',
        columnNames: ['organizationId', 'customerId', 'dueAt'],
      },
    ],
    checks: [
      {
        expression: '"amount" > 0',
      },
      {
        expression: '"paid" <= "amount"',
      },
      {
        expression: '"dueAt" >= "issuedAt"',
      },
      {
        expression: "\"status\" IN ('Open', 'Disputed', 'Draft', 'Written off')",
      },
      {
        expression: '"amount" BETWEEN 0 AND 1000000000000',
      },
      {
        expression: '"paid" BETWEEN 0 AND 1000000000000',
      },
    ],
  },
  {
    name: 'payments',
    columns: [
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'id',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'sortOrder',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'customerId',
        type: 'varchar',
        isPrimary: false,
        isNullable: true,
      },
      {
        name: 'amount',
        type: 'bigint',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'date',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'reference',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'referenceKey',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'description',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'bank',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'method',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'status',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
      {
        columnNames: ['organizationId', 'customerId'],
        referencedColumnNames: ['organizationId', 'id'],
        referencedTableName: 'customers',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [
      {
        name: 'uq_payments_0',
        columnNames: ['organizationId', 'bank', 'referenceKey'],
      },
      {
        name: 'uq_payments_1',
        columnNames: ['organizationId', 'id', 'customerId'],
      },
    ],
    indices: [
      {
        name: 'ix_payments_0',
        columnNames: ['organizationId', 'customerId', 'date'],
      },
    ],
    checks: [
      {
        expression: '"amount" > 0',
      },
      {
        expression: "\"status\" IN ('Unmatched', 'Partial', 'Matched', 'Reversed')",
      },
      {
        expression: '"amount" BETWEEN 0 AND 1000000000000',
      },
    ],
  },
  {
    name: 'payment_allocations',
    columns: [
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'paymentId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'sortOrder',
        type: 'integer',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'customerId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'invoiceId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'amount',
        type: 'bigint',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
      {
        columnNames: ['organizationId', 'paymentId', 'customerId'],
        referencedColumnNames: ['organizationId', 'id', 'customerId'],
        referencedTableName: 'payments',
        onDelete: 'RESTRICT',
      },
      {
        columnNames: ['organizationId', 'invoiceId', 'customerId'],
        referencedColumnNames: ['organizationId', 'id', 'customerId'],
        referencedTableName: 'invoices',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [],
    indices: [
      {
        name: 'ix_payment_allocations_0',
        columnNames: ['organizationId', 'invoiceId'],
      },
    ],
    checks: [
      {
        expression: '"amount" > 0',
      },
      {
        expression: '"amount" BETWEEN 0 AND 1000000000000',
      },
    ],
  },
  {
    name: 'payment_promises',
    columns: [
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'id',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'sortOrder',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'customerId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'amount',
        type: 'bigint',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'date',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'createdAt',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'status',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'note',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
      {
        columnNames: ['organizationId', 'customerId'],
        referencedColumnNames: ['organizationId', 'id'],
        referencedTableName: 'customers',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [
      {
        name: 'uq_payment_promises_0',
        columnNames: ['organizationId', 'id', 'customerId'],
      },
    ],
    indices: [
      {
        name: 'ix_payment_promises_0',
        columnNames: ['organizationId', 'customerId', 'status'],
      },
    ],
    checks: [
      {
        expression: '"amount" > 0',
      },
      {
        expression: "\"status\" IN ('Pending', 'Partially kept', 'Kept', 'Broken', 'Cancelled')",
      },
      {
        expression: '"amount" BETWEEN 0 AND 1000000000000',
      },
    ],
  },
  {
    name: 'promise_baselines',
    columns: [
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'promiseId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'paymentId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'customerId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'amount',
        type: 'bigint',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'sortOrder',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
      {
        columnNames: ['organizationId', 'promiseId', 'customerId'],
        referencedColumnNames: ['organizationId', 'id', 'customerId'],
        referencedTableName: 'payment_promises',
        onDelete: 'RESTRICT',
      },
      {
        columnNames: ['organizationId', 'paymentId', 'customerId'],
        referencedColumnNames: ['organizationId', 'id', 'customerId'],
        referencedTableName: 'payments',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [],
    indices: [],
    checks: [
      {
        expression: '"amount" BETWEEN 0 AND 1000000000000',
      },
    ],
  },
  {
    name: 'interactions',
    columns: [
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'id',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'sortOrder',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'customerId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'at',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'author',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'channel',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'message',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'outcome',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'nextAction',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'direction',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
      {
        columnNames: ['organizationId', 'customerId'],
        referencedColumnNames: ['organizationId', 'id'],
        referencedTableName: 'customers',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [],
    indices: [
      {
        name: 'ix_interactions_0',
        columnNames: ['organizationId', 'customerId', 'at'],
      },
    ],
    checks: [],
  },
  {
    name: 'reminder_jobs',
    columns: [
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'id',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'sortOrder',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'customerId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'message',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'scheduledAt',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'status',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'createdBy',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
      {
        columnNames: ['organizationId', 'customerId'],
        referencedColumnNames: ['organizationId', 'id'],
        referencedTableName: 'customers',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [],
    indices: [
      {
        name: 'ix_reminder_jobs_0',
        columnNames: ['organizationId', 'customerId', 'scheduledAt'],
      },
    ],
    checks: [
      {
        expression: "\"status\" IN ('Queued', 'Prepared', 'Cancelled')",
      },
    ],
  },
  {
    name: 'audit_events',
    columns: [
      {
        name: 'organizationId',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'id',
        type: 'varchar',
        isPrimary: true,
        isNullable: false,
      },
      {
        name: 'sortOrder',
        type: 'integer',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'at',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'actor',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'action',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'detail',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
      {
        name: 'entityId',
        type: 'varchar',
        isPrimary: false,
        isNullable: false,
      },
    ],
    foreignKeys: [
      {
        columnNames: ['organizationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'RESTRICT',
      },
    ],
    uniques: [],
    indices: [
      {
        name: 'ix_audit_events_0',
        columnNames: ['organizationId', 'at'],
      },
      {
        name: 'ix_audit_events_1',
        columnNames: ['organizationId', 'action'],
      },
    ],
    checks: [],
  },
];
