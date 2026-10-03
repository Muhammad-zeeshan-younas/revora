<script setup lang="ts">
  import { onMounted, onBeforeUnmount, useTemplateRef } from 'vue';
  import Icon from './UiIcon.vue';

  defineProps<{ title: string; subtitle?: string; wide?: boolean }>();
  const emit = defineEmits<{ close: [] }>();
  const dialog = useTemplateRef<HTMLDialogElement>('dialog');
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  onMounted(() => {
    dialog.value?.showModal();
    document.body.style.overflow = 'hidden';
  });
  onBeforeUnmount(() => {
    document.body.style.overflow = '';
    previousFocus?.focus();
  });

  function backdrop(event: MouseEvent): void {
    if (dialog.value && event.target === dialog.value) {
      const bounds = dialog.value.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) {
        emit('close');
      }
    }
  }
</script>
<template>
  <dialog
    ref="dialog"
    :class="['modal', { wide }]"
    aria-labelledby="modal-title"
    @cancel.prevent="emit('close')"
    @click="backdrop"
  >
    <header class="modal-header">
      <div>
        <h2 id="modal-title">{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <button
        class="icon-button"
        aria-label="Close dialog"
        @click="emit('close')"
      >
        <Icon name="close" />
      </button>
    </header>
    <div class="modal-body"><slot /></div>
  </dialog>
</template>

<style scoped lang="scss" src="./UiModal.scss"></style>
