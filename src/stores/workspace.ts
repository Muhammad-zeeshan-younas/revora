import { ref, shallowRef } from 'vue';
import { snapshotSchema } from '../../shared/schema';
import type { Command, Snapshot } from '../../shared/schema';
import { ApiError, request } from '../lib/http-client';
import { notify } from '../composables/useNotifications';

export const snapshot = shallowRef<Snapshot | null>(null);

export const loading = ref(false);

export const saving = ref(false);

export const loadError = ref('');

export async function loadWorkspace(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    snapshot.value = await request('/workspace', snapshotSchema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      snapshot.value = null;
    } else {
      loadError.value = error instanceof Error ? error.message : 'Unable to load your workspace.';
    }
  } finally {
    loading.value = false;
  }
}

export async function mutate(command: Command): Promise<void> {
  if (!snapshot.value || saving.value) {
    throw new Error('Wait for the current operation to finish.');
  }
  saving.value = true;
  try {
    snapshot.value = await request('/workspace/commands', snapshotSchema, {
      revision: snapshot.value.revision,
      command,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      await loadWorkspace();
    }
    if (error instanceof ApiError && error.status === 401) {
      snapshot.value = null;
      notify('Your session expired. Please sign in again.');
    }
    throw error;
  } finally {
    saving.value = false;
  }
}
