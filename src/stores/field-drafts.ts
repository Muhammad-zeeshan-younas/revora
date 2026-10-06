import { ref } from 'vue';
import { z } from 'zod';
import { CommandType, Role } from '../../shared/enums';
import { commandSchema, mutationSchema, snapshotSchema } from '../../shared/schema';
import type { Command, Mutation } from '../../shared/schema';
import { ApiError, request } from '../lib/http-client';
import { loadWorkspace, saving, snapshot } from './workspace';

const FIELD_DRAFT_STORAGE_PREFIX = 'revora:field-drafts';
const MAXIMUM_FIELD_DRAFTS = 100;
const fieldDraftSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  command: commandSchema,
  mutation: mutationSchema.nullable(),
});

export type FieldDraft = z.infer<typeof fieldDraftSchema>;
export const fieldDrafts = ref<FieldDraft[]>([]);

function storageKey(): string {
  const current = snapshot.value;
  if (!current) {
    throw new Error('Sign in before saving field drafts.');
  }

  return `${FIELD_DRAFT_STORAGE_PREFIX}:${current.session.organizationId}:${current.session.user.id}`;
}

function saveDrafts(): void {
  localStorage.setItem(storageKey(), JSON.stringify(fieldDrafts.value));
}

export function loadFieldDrafts(): void {
  try {
    const raw = localStorage.getItem(storageKey());
    fieldDrafts.value = raw
      ? z.array(fieldDraftSchema).max(MAXIMUM_FIELD_DRAFTS).parse(JSON.parse(raw))
      : [];
  } catch {
    fieldDrafts.value = [];
  }
}

export function queueFieldDraft(command: Command): void {
  if (snapshot.value?.session.user.role === Role.Viewer) {
    throw new Error('Your role cannot save field drafts.');
  }
  if (![CommandType.CreateInteraction, CommandType.CreatePromise].includes(command.type)) {
    throw new Error('Only field interactions and payment promises can be saved offline.');
  }
  if (fieldDrafts.value.length >= MAXIMUM_FIELD_DRAFTS) {
    throw new Error('Sync or remove field drafts before adding more.');
  }
  const parsed = commandSchema.parse(command);
  const draft: FieldDraft = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    command: parsed,
    mutation: null,
  };
  fieldDrafts.value.push(draft);
  try {
    saveDrafts();
  } catch (error) {
    fieldDrafts.value.pop();
    throw error;
  }
}

export function removeFieldDraft(id: string): void {
  fieldDrafts.value = fieldDrafts.value.filter((draft) => draft.id !== id);
  saveDrafts();
}

export function clearFieldDrafts(): void {
  try {
    localStorage.removeItem(storageKey());
  } catch {
    // In-memory drafts still need to be cleared when browser storage is unavailable.
  }
  fieldDrafts.value = [];
}

export async function syncFieldDrafts(): Promise<void> {
  if (!snapshot.value || saving.value) {
    throw new Error('Wait for the current operation to finish.');
  }
  if (!navigator.onLine) {
    throw new Error('Reconnect before syncing field drafts.');
  }
  saving.value = true;
  try {
    for (const draft of [...fieldDrafts.value]) {
      if (!snapshot.value) {
        throw new Error('Sign in before syncing field drafts.');
      }
      const mutation: Mutation = draft.mutation ?? {
        revision: snapshot.value.revision,
        requestId: crypto.randomUUID(),
        command: draft.command,
      };
      draft.mutation = mutation;
      saveDrafts();

      try {
        snapshot.value = await request('/workspace/commands', snapshotSchema, mutation);
        removeFieldDraft(draft.id);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          draft.mutation = null;
          saveDrafts();
          await loadWorkspace();
          throw new Error('Workspace changed. Review this draft before syncing again.');
        }
        if (error instanceof ApiError && error.status === 401) {
          await loadWorkspace();
        }
        throw error;
      }
    }
  } finally {
    saving.value = false;
  }
}
