import { EntitySchema } from 'typeorm';

export interface WorkerRunRecord {
  name: string;
  lastStartedAt: string;
  lastFinishedAt: string;
  lastSuccessAt: string;
  lastError: string;
}

export const WorkerRunEntity = new EntitySchema<WorkerRunRecord>({
  name: 'WorkerRun',
  tableName: 'worker_runs',
  columns: {
    name: { type: 'varchar', primary: true },
    lastStartedAt: { type: 'varchar' },
    lastFinishedAt: { type: 'varchar' },
    lastSuccessAt: { type: 'varchar' },
    lastError: { type: 'varchar' },
  },
});
