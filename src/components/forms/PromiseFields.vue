<script setup lang="ts">
  import type { ActionForm } from './action-form.types';
  import type { Workspace } from '../../../shared/schema';
  import type { ReplyAnalysis } from '../../../shared/assistant';
  import { today, account, formatMoney } from '../../../shared/finance';
  import Icon from '../ui/UiIcon.vue';
  import Badge from '../ui/UiBadge.vue';

  const form = defineModel<ActionForm>({ required: true });
  defineProps<{ workspace: Workspace; analysis: ReplyAnalysis | null }>();
  const emit = defineEmits<{ draft: [] }>();
</script>

<template>
  <label>
    Customer’s message
    <textarea
      v-model="form.message"
      rows="3"
      placeholder="Monday ko 2 lakh transfer kar doon ga."
    ></textarea>
  </label>
  <button
    type="button"
    class="button small"
    :disabled="!form.message"
    @click="emit('draft')"
  >
    <Icon
      name="sparkle"
      :size="16"
    />
    Extract a draft
  </button>
  <div
    v-if="analysis"
    class="analysis-result"
  >
    <Badge :label="analysis.category" />
    <p>{{ analysis.explanation }}</p>
  </div>
  <div class="form-grid spaced">
    <label>
      Promised amount (PKR)
      <input
        v-model="form.amount"
        type="text"
        inputmode="decimal"
        pattern="\d+(\.\d{1,2})?"
        required
      />
    </label>
    <label>
      Promised date
      <input
        v-model="form.date"
        type="date"
        :min="today()"
        required
      />
    </label>
  </div>
  <p class="field-help">
    Available balance: {{ formatMoney(account(workspace, form.customerId).outstanding) }}. Confirm
    these details before saving.
  </p>
</template>
<style scoped lang="scss">
  @use '../../styles/tokens' as *;
  .analysis-result {
    border-left: 2px solid $accent-light;
    padding: 12px 15px;
    background: $surface-soft;
    margin-top: 15px;
    p {
      font-size: 12px;
      line-height: 1.7;
      color: $muted;
      margin-top: 8px;
    }
  }
</style>
