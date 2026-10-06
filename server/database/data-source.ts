import { mkdirSync } from 'node:fs';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { entities } from '../models/entities';
import { NormalizeWorkspace1789200000000 } from '../migrations/1789200000000-normalize-workspace';
import { CommandReceipts1789200000001 } from '../migrations/1789200000001-command-receipts';
import { PasswordResets1789200000002 } from '../migrations/1789200000002-password-resets';
import { BankImportProfiles1789200000003 } from '../migrations/1789200000003-bank-import-profiles';
import { WorkerLeases1789200000004 } from '../migrations/1789200000004-worker-leases';
import { InvoiceCorrections1789200000005 } from '../migrations/1789200000005-invoice-corrections';
import { BankReconciliations1789200000006 } from '../migrations/1789200000006-bank-reconciliations';
import { RecordPages1789200000007 } from '../migrations/1789200000007-record-pages';
import { CustomerTerritories1789200000008 } from '../migrations/1789200000008-customer-territories';
import { WhatsAppDelivery1789200000009 } from '../migrations/1789200000009-whatsapp-delivery';
import { WhatsAppConsent1789200000010 } from '../migrations/1789200000010-whatsapp-consent';
import { Attachments1789200000011 } from '../migrations/1789200000011-attachments';
import { ManagementReports1789200000012 } from '../migrations/1789200000012-management-reports';
import { UserMfa1789200000013 } from '../migrations/1789200000013-user-mfa';
import { EmailVerification1789200000014 } from '../migrations/1789200000014-email-verification';
import { OrderInventory1789200000015 } from '../migrations/1789200000015-order-inventory';
import { Monitoring1789200000016 } from '../migrations/1789200000016-monitoring';

export function createDatabase(memory = false): DataSource {
  const migrations = [
    NormalizeWorkspace1789200000000,
    CommandReceipts1789200000001,
    PasswordResets1789200000002,
    BankImportProfiles1789200000003,
    WorkerLeases1789200000004,
    InvoiceCorrections1789200000005,
    BankReconciliations1789200000006,
    RecordPages1789200000007,
    CustomerTerritories1789200000008,
    WhatsAppDelivery1789200000009,
    WhatsAppConsent1789200000010,
    Attachments1789200000011,
    ManagementReports1789200000012,
    UserMfa1789200000013,
    EmailVerification1789200000014,
    OrderInventory1789200000015,
    Monitoring1789200000016,
  ];
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
