import { EntitySchema } from 'typeorm';

export interface WorkerLeaseRecord {
  name: string;
  ownerToken: string;
  expiresAt: string;
}

export const WorkerLeaseEntity = new EntitySchema<WorkerLeaseRecord>({
  name: 'WorkerLease',
  tableName: 'worker_leases',
  columns: {
    name: { type: 'varchar', primary: true },
    ownerToken: { type: 'varchar' },
    expiresAt: { type: 'varchar' },
  },
});
