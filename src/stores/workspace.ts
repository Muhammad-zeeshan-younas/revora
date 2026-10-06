import { ref, shallowRef } from 'vue';
import { z } from 'zod';
import { mutationSchema, snapshotSchema } from '../../shared/schema';
import type { Command, Mutation, Snapshot } from '../../shared/schema';
import { ApiError, request } from '../lib/http-client';
import { notify } from '../composables/useNotifications';
import { refreshOfflineAccount } from './offline-account';

enum PendingRecoveryStatus {
  None = 'none',
  Confirmed = 'confirmed',
  Conflict = 'conflict',
}

const WORKSPACE_COMMANDS_PATH = '/workspace/commands';
const PENDING_MUTATION_STORAGE_PREFIX = 'revora:pending';
const PENDING_OFFLINE_LOGOUT_KEY = 'revora:pending-offline-logout';

export const snapshot = shallowRef<Snapshot | null>(null);
export const loading = ref(false);
export const saving = ref(false);
export const loadError = ref('');
export const offlineMode = ref(false);
export const workspaceComplete = ref(false);

function pendingKey(): string | null {
  const current = snapshot.value;

  return current
    ? `${PENDING_MUTATION_STORAGE_PREFIX}:${current.session.organizationId}:${current.session.user.id}`
    : null;
}

function savedPending(): Mutation | null {
  const key = pendingKey();
  if (!key || typeof sessionStorage === 'undefined') {
    return null;
  }

  const raw = sessionStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = mutationSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // A corrupt browser entry cannot be safely replayed.
  }

  sessionStorage.removeItem(key);

  return null;
}

function clearPending(): void {
  const key = pendingKey();
  if (key && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(key);
  }
}

async function reconcilePending(): Promise<PendingRecoveryStatus> {
  const pending = savedPending();
  if (!pending) {
    return PendingRecoveryStatus.None;
  }

  try {
    snapshot.value = await request(WORKSPACE_COMMANDS_PATH, snapshotSchema, pending);
    workspaceComplete.value = true;
    clearPending();
    notify('A previous save was confirmed after reconnecting.');

    return PendingRecoveryStatus.Confirmed;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      clearPending();
      notify('A previous save was not applied because the workspace changed. Review it and retry.');

      return PendingRecoveryStatus.Conflict;
    }
    if (error instanceof ApiError && error.status !== 401) {
      clearPending();
    }
    throw error;
  }
}

async function loadSnapshot(path: string): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    if (localStorage.getItem(PENDING_OFFLINE_LOGOUT_KEY)) {
      try {
        await request('/auth/logout', z.object({ ok: z.boolean() }), {});
        localStorage.removeItem(PENDING_OFFLINE_LOGOUT_KEY);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) {throw error;}
        localStorage.removeItem(PENDING_OFFLINE_LOGOUT_KEY);
      }
      snapshot.value = null;
      workspaceComplete.value = false;

      return;
    }
    snapshot.value = await request(path, snapshotSchema);
    workspaceComplete.value = path === '/workspace';
    offlineMode.value = false;
    await reconcilePending();
    if (snapshot.value) {await refreshOfflineAccount(snapshot.value);}
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      snapshot.value = null;
      workspaceComplete.value = false;
    } else {
      loadError.value = error instanceof Error ? error.message : 'Unable to load your workspace.';
    }
  } finally {
    loading.value = false;
  }
}

export async function loadWorkspace(): Promise<void> {
  await loadSnapshot('/workspace');
}

export async function loadBootstrapWorkspace(): Promise<void> {
  await loadSnapshot('/workspace/bootstrap');
}

export function markPendingOfflineLogout(): void {
  localStorage.setItem(PENDING_OFFLINE_LOGOUT_KEY, 'true');
}

export async function mutate(command: Command): Promise<void> {
  if (offlineMode.value) {
    throw new Error(
      'Reconnect before changing account records. Field notes can be saved as drafts.',
    );
  }
  if (!snapshot.value || saving.value) {
    throw new Error('Wait for the current operation to finish.');
  }
  saving.value = true;
  try {
    const recovered = await reconcilePending();
    if (recovered !== PendingRecoveryStatus.None) {
      throw new Error(
        recovered === PendingRecoveryStatus.Confirmed
          ? 'Your previous save was confirmed. Review the updated workspace before saving again.'
          : 'Your previous save could not be applied. Review the updated workspace before retrying.',
      );
    }

    const payload = {
      revision: snapshot.value.revision,
      requestId: crypto.randomUUID(),
      command,
    };

    const key = pendingKey();
    if (key && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, JSON.stringify(payload));
    }

    try {
      snapshot.value = await request(WORKSPACE_COMMANDS_PATH, snapshotSchema, payload);
      workspaceComplete.value = true;
    } catch (error) {
      if (!(error instanceof TypeError) && !(error instanceof DOMException)) {
        throw error;
      }
      // A response may be lost after the database commits. Reuse the same ID on retry.
      snapshot.value = await request(WORKSPACE_COMMANDS_PATH, snapshotSchema, payload);
      workspaceComplete.value = true;
    }
    clearPending();
    if (snapshot.value) {await refreshOfflineAccount(snapshot.value);}
  } catch (error) {
    if (error instanceof ApiError && error.status !== 401) {
      clearPending();
    }
    if (error instanceof ApiError && error.status === 409) {
      await loadWorkspace();
    }
    if (error instanceof ApiError && error.status === 401) {
      snapshot.value = null;
      workspaceComplete.value = false;
      notify('Your session expired. Please sign in again.');
    }
    throw error;
  } finally {
    saving.value = false;
  }
}
