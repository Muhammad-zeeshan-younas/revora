<script setup lang="ts">
  import type { ActionForm } from './action-form.types';
  import { computed } from 'vue';
  import type { Workspace, Payment } from '../../../shared/schema';
  import type { MatchSuggestion } from '../../../shared/finance';
  import { balance, formatMoney } from '../../../shared/finance';
  import { InvoiceStatus } from '../../../shared/enums';
  import Icon from '../ui/UiIcon.vue';
  import Badge from '../ui/UiBadge.vue';

  const form = defineModel<ActionForm>({ required: true });
  const props = defineProps<{
    workspace: Workspace;
    payment: Payment;
    suggestion: MatchSuggestion | null;
  }>();
  const allocations = defineModel<Record<string, string>>('allocations', { required: true });
  const availableInvoices = computed(() =>
    props.workspace.invoices.filter(
      (invoice) =>
        invoice.customerId === form.value.customerId &&
        invoice.status === InvoiceStatus.Open &&
        balance(invoice) > 0,
    ),
  );
  const remainingPayment = computed(
    () =>
      props.payment.amount -
      props.payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
  );
  const allocationTotal = computed(
    () =>
      Object.values(allocations.value).reduce((sum, value) => sum + (Number(value) || 0), 0) * 100,
  );

  function clearAllocations(): void {
    allocations.value = {};
  }
</script>

<template>
  <div class="match-transaction">
    <span class="integration-logo">
      <Icon
        name="payments"
        :size="28"
      />
    </span>
    <div>
      <small>{{ payment.bank }} · {{ payment.date }}</small>
      <strong>{{ formatMoney(remainingPayment) }}</strong>
      <span>{{ payment.reference }} · {{ payment.description }}</span>
    </div>
    <Badge :label="payment.status" />
  </div>
  <div
    v-if="suggestion"
    class="match-suggestion"
  >
    <Icon
      name="sparkle"
      :size="21"
    />
    <div>
      <strong>
        {{ suggestion.confidence }}% match confidence · {{ suggestion.customer.name }}
      </strong>
      <p>{{ suggestion.reason }}</p>
    </div>
  </div>
  <label>
    Allocate to customer
    <select
      v-model="form.customerId"
      required
      :disabled="Boolean(payment.customerId)"
      @change="clearAllocations"
    >
      <option
        value=""
        disabled
      >
        Select customer
      </option>
      <option
        v-for="customer in workspace.customers"
        :key="customer.id"
        :value="customer.id"
      >
        {{ customer.name }}
      </option>
    </select>
  </label>
  <div class="allocation-list">
    <div class="allocation-heading">
      <span>Open invoice</span>
      <span>Outstanding</span>
      <span>Allocate (PKR)</span>
    </div>
    <div
      v-for="item in availableInvoices"
      :key="item.id"
      class="allocation-row"
    >
      <span>
        <strong>{{ item.number }}</strong>
        <small>Due {{ item.dueAt }}</small>
      </span>
      <span>{{ formatMoney(balance(item)) }}</span>
      <input
        v-model="allocations[item.id]"
        :aria-label="`Allocate to ${item.number}`"
        type="text"
        inputmode="decimal"
        pattern="\d+(\.\d{1,2})?"
        placeholder="0.00"
      />
    </div>
    <p
      v-if="!availableInvoices.length"
      class="field-help"
    >
      Choose a customer with open invoices. Disputed invoices cannot receive allocations.
    </p>
  </div>
  <div class="allocation-total">
    <span>
      Allocation total
      <strong>{{ formatMoney(Math.round(allocationTotal)) }}</strong>
    </span>
    <span :class="{ 'text-red': allocationTotal > remainingPayment }">
      Unallocated remainder
      <strong>{{ formatMoney(Math.round(remainingPayment - allocationTotal)) }}</strong>
    </span>
  </div>
  <p class="field-help">
    Approval updates invoice balances atomically. Allocations can be reversed with an audit reason.
  </p>
</template>
<style scoped lang="scss" src="./AllocationFields.scss"></style>
