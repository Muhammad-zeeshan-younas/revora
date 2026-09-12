<script setup lang="ts">
  import type { ActionForm } from './action-form.types';
  import { computed } from 'vue';
  import type { Workspace } from '../../../shared/schema';
  import { account, formatMoney } from '../../../shared/finance';
  import Icon from '../ui/UiIcon.vue';

  const form = defineModel<ActionForm>({ required: true });
  const props = defineProps<{ workspace: Workspace }>();
  const selectedCustomer = computed(() =>
    props.workspace.customers.find((customer) => customer.id === form.value.customerId),
  );
  const projectedExposure = computed(
    () =>
      account(props.workspace, form.value.customerId).outstanding +
      Math.round((Number(form.value.orderAmount) || 0) * 100),
  );
</script>

<template>
  <div class="profile-metrics two">
    <div>
      <span>Current exposure</span>
      <strong>{{ formatMoney(account(workspace, form.customerId).outstanding, true) }}</strong>
    </div>
    <div>
      <span>Current limit</span>
      <strong>{{ formatMoney(selectedCustomer?.creditLimit ?? 0, true) }}</strong>
    </div>
  </div>
  <label>
    Check a new order (PKR)
    <input
      v-model="form.orderAmount"
      type="text"
      inputmode="decimal"
      pattern="\d+(\.\d{1,2})?"
      placeholder="Optional order amount"
    />
  </label>
  <div
    v-if="form.orderAmount"
    class="info-note"
    :class="{ 'warning-note': projectedExposure > (selectedCustomer?.creditLimit ?? 0) }"
  >
    <Icon name="shield" />
    <p>
      Projected exposure: {{ formatMoney(projectedExposure) }}.
      {{
        projectedExposure > (selectedCustomer?.creditLimit ?? 0)
          ? `Exceeds the current limit by ${formatMoney(projectedExposure - (selectedCustomer?.creditLimit ?? 0))}. Human approval is needed before accepting this order.`
          : 'Within the current credit limit.'
      }}
    </p>
  </div>
  <label>
    New approved credit limit (PKR)
    <input
      v-model="form.creditLimit"
      type="text"
      inputmode="decimal"
      pattern="\d+(\.\d{1,2})?"
      required
    />
  </label>
  <label>
    Reason for this decision
    <textarea
      v-model="form.reason"
      rows="3"
      minlength="5"
      required
      placeholder="Record the business reason for this limit."
    ></textarea>
  </label>
  <p class="field-help">Owner or admin approval. This decision is recorded in the audit log.</p>
</template>
<style scoped lang="scss">
  @use '../../styles/tokens' as *;
  .profile-metrics.two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
    span {
      font-size: 12px;
      color: $muted;
    }
    strong {
      display: block;
      font-size: 24px;
      margin-top: 10px;
    }
  }
</style>
