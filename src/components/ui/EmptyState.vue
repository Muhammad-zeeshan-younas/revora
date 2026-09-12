<script setup lang="ts">
  import Icon from './UiIcon.vue';

  withDefaults(defineProps<{ title?: string; text?: string }>(), {
    title: 'Nothing here yet',
    text: 'Your workspace activity will appear here.',
  });
</script>
<template>
  <div class="empty-state">
    <span class="empty-icon">
      <Icon
        name="invoice"
        :size="26"
      />
    </span>
    <h3>{{ title }}</h3>
    <p>{{ text }}</p>
    <slot />
  </div>
</template>

<style scoped lang="scss">
  @use '../../styles/tokens' as *;

  .empty-state {
    padding: 50px 20px;
    text-align: center;
    h3 {
      font-size: 16px;
      font-weight: 550;
      margin: 15px 0 9px;
    }
    p {
      font-size: 12px;
      color: $muted;
      max-width: 360px;
      margin: auto;
      line-height: 1.7;
    }
  }

  .empty-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 53px;
    height: 53px;
    border: 1px solid $surface-muted;
    border-radius: 14px;
    background: $surface-soft;
    color: $muted;
  }

  .empty-state p {
    color: $muted;
    font-size: 12px;
  }
</style>
