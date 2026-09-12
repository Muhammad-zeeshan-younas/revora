import type { Workspace } from '../../shared/schema';

/** Assembled API snapshot; this is not a persisted JSON column. */
export interface WorkspaceRecord {
  id: string;
  data: Workspace;
  revision: number;
}
