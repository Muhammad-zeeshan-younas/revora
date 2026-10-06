<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import { z } from 'zod';
  import { Role } from '../../shared/enums';
  import { notify } from '../composables/useNotifications';
  import type { ActionKind } from '../config/ui.enums';
  import { request } from '../lib/http-client';
  import type { Action } from '../types';
  import Modal from './ui/UiModal.vue';

  type AttachmentAction = Extract<Action, { kind: ActionKind.Attachments }>;

  const MAX_ATTACHMENT_BYTES = 1_000_000;
  const BASE64_CHUNK_BYTES = 32_768;
  const ACCEPTED_MEDIA_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
  const attachmentSchema = z.object({
    id: z.string(),
    target: z.string(),
    targetId: z.string(),
    fileName: z.string(),
    mediaType: z.string(),
    byteLength: z.number(),
    uploadedBy: z.string(),
    uploadedAt: z.string(),
  });

  const props = defineProps<{ action: AttachmentAction; role: Role }>();
  const emit = defineEmits<{ close: [] }>();
  const records = ref<z.infer<typeof attachmentSchema>[]>([]);
  const busy = ref(false);
  const error = ref('');
  const input = ref<HTMLInputElement | null>(null);

  function endpoint(): string {
    return `/workspace/attachments/${props.action.target}/${encodeURIComponent(props.action.targetId)}`;
  }

  async function load(): Promise<void> {
    error.value = '';
    try {
      records.value = await request(endpoint(), z.array(attachmentSchema));
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not load documents.';
    }
  }

  function encodeFile(bytes: Uint8Array): string {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES));
    }

    return btoa(binary);
  }

  async function upload(): Promise<void> {
    const file = input.value?.files?.[0];
    if (!file) {return;}
    if (file.size > MAX_ATTACHMENT_BYTES || file.size === 0) {
      error.value = 'Choose a nonempty document up to 1 MB.';

      return;
    }
    if (!ACCEPTED_MEDIA_TYPES.includes(file.type)) {
      error.value = 'Choose a PDF, PNG, JPEG, or WebP document.';

      return;
    }

    busy.value = true;
    error.value = '';
    try {
      const contentBase64 = encodeFile(new Uint8Array(await file.arrayBuffer()));
      await request(endpoint(), attachmentSchema, {
        fileName: file.name,
        mediaType: file.type,
        contentBase64,
      });
      if (input.value) {input.value.value = '';}
      await load();
      notify('Document attached.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not attach document.';
    } finally {
      busy.value = false;
    }
  }

  async function download(record: z.infer<typeof attachmentSchema>): Promise<void> {
    error.value = '';
    try {
      const response = await fetch(
        `/api/workspace/attachments/${encodeURIComponent(record.id)}/download`,
        {
          credentials: 'same-origin',
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) {throw new Error('Could not download document.');}
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = record.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not download document.';
    }
  }

  onMounted(() => void load());
</script>

<template>
  <Modal
    title="Supporting documents"
    :subtitle="action.label"
    @close="emit('close')"
  >
    <p>Attach an invoice, deposit slip, or other supporting PDF or image. Maximum 1 MB per file.</p>
    <div
      v-if="role !== Role.Viewer"
      class="attachment-upload"
    >
      <input
        ref="input"
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        :disabled="busy"
      />
      <button
        class="button primary small"
        :disabled="busy"
        @click="upload"
      >
        {{ busy ? 'Uploading…' : 'Attach file' }}
      </button>
    </div>
    <p
      v-if="error"
      role="alert"
      class="text-red"
    >
      {{ error }}
    </p>
    <p v-if="!records.length">No documents are attached yet.</p>
    <div
      v-for="record in records"
      :key="record.id"
      class="attachment-row"
    >
      <span>
        <strong>{{ record.fileName }}</strong>
        <small>{{ Math.ceil(record.byteLength / 1024) }} KB · {{ record.uploadedBy }}</small>
      </span>
      <button
        class="button small"
        @click="download(record)"
      >
        Download
      </button>
    </div>
  </Modal>
</template>

<style scoped>
  .attachment-upload,
  .attachment-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1rem;
  }
  .attachment-row {
    justify-content: space-between;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border, #e5e7eb);
  }
  .attachment-row span {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }
  .attachment-row strong {
    overflow-wrap: anywhere;
  }
  .attachment-row small {
    color: var(--text-muted, #6b7280);
  }
</style>
