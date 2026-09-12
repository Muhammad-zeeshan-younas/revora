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
<style scoped lang="scss">
  @use '../../styles/tokens' as *;
  .match-transaction {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px;
    background: $surface;
    border: 1px solid $surface-muted;
    border-radius: 9px;
    margin-bottom: 18px;
    > div {
      flex: 1;
    }
    small {
      color: $muted;
      font-size: 12px;
    }
    strong {
      display: block;
      font-size: 26px;
      font-weight: 550;
      margin: 6px 0;
    }
    div > span {
      font-size: 12px;
      color: $muted;
    }
  }

  .match-suggestion {
    display: flex;
    gap: 12px;
    padding: 14px;
    border-radius: 7px;
    background: $surface-soft;
    color: $muted;
    margin-bottom: 20px;
    svg {
      flex-shrink: 0;
    }
    strong {
      font-size: 12px;
    }
    p {
      font-size: 12px;
      line-height: 1.7;
      margin-top: 5px;
    }
  }

  .allocation-heading,
  .allocation-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 17px;
    align-items: center;
  }

  .allocation-heading {
    font-size: 12px;
    color: $muted;
    padding: 10px 0;
    border-bottom: 1px solid $surface-muted;
  }

  .allocation-row {
    padding: 12px 0;
    border-bottom: 1px solid $surface-soft;
    > span {
      font-size: 12px;
    }
    small {
      display: block;
      margin-top: 4px;
      color: $muted;
      font-size: 12px;
    }
    input {
      text-align: right;
      font-size: 12px;
      padding: 8px;
    }
  }

  .allocation-total {
    display: flex;
    justify-content: space-between;
    background: $surface-soft;
    border-radius: 6px;
    margin-top: 18px;
    padding: 15px;
    margin-bottom: 20px;
    span {
      font-size: 12px;
      color: $muted;
    }
    strong {
      display: block;
      color: $ink;
      font-size: 18px;
      margin-top: 7px;
      font-weight: 550;
    }
  }

  @media (max-width: 760px) {
    .match-transaction {
      padding: 13px;
      gap: 10px;
      flex-wrap: wrap;
      .integration-logo {
        width: 34px;
        height: 34px;
      }
      strong {
        font-size: 23px;
      }
      .badge {
        margin-left: 44px;
      }
    }
    .allocation-heading,
    .allocation-row {
      gap: 8px;
      grid-template-columns: 1fr 1fr 1fr;
    }
    .allocation-row > span {
      font-size: 12px;
    }
    .allocation-heading {
      font-size: 12px;
    }
    .allocation-total strong {
      font-size: 16px;
    }
  }
</style>
