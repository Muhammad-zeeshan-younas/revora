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

<style scoped lang="scss" src="./EmptyState.scss"></style>
