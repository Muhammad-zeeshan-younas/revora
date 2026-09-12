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

<style scoped lang="scss">
  @use '../../styles/tokens' as *;

  .modal {
    width: min(540px, calc(100vw - 32px));
    max-height: calc(100dvh - 48px);
    padding: 0;
    border: 1px solid $surface-muted;
    border-radius: 14px;
    color: $ink;
    box-shadow: 0 25px 100px #14264140;
    background: #fff;
    animation: modal-in 0.2s ease-out;
    &.wide {
      width: min(820px, calc(100vw - 32px));
    }
    &::backdrop {
      background: #14264166;
      backdrop-filter: blur(4px);
    }
  }

  .modal-header {
    padding: 25px 27px 22px;
    border-bottom: 1px solid $surface-muted;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
    background: $surface;
    h2 {
      font-size: 20px;
      font-weight: 560;
      letter-spacing: -0.5px;
    }
    p {
      margin-top: 8px;
      font-size: 12px;
      color: $muted;
    }
    .icon-button {
      margin: -5px -7px 0 0;
    }
  }

  .modal-body {
    padding: 25px 27px;
  }

  @keyframes modal-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.99);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 760px) {
    .modal {
      max-height: calc(100dvh - 24px);
      width: calc(100vw - 24px);
      &.wide {
        width: calc(100vw - 24px);
      }
    }
    .modal-header {
      padding: 22px 20px;
      h2 {
        font-size: 19px;
      }
    }
    .modal-body {
      padding: 22px 20px;
    }
  }

  .modal-header p {
    color: $muted;
  }
</style>
