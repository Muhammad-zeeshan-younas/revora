<script setup lang="ts">
  import type { ActionForm } from './action-form.types';
  import type { Workspace } from '../../../shared/schema';
  import { PaymentMethod } from '../../../shared/enums';
  import { today } from '../../../shared/finance';

  const form = defineModel<ActionForm>({ required: true });
  defineProps<{ workspace: Workspace }>();
</script>

<template>
  <label>
    Customer
    <select v-model="form.customerId">
      <option value="">Unidentified — match later</option>
      <option
        v-for="customer in workspace.customers"
        :key="customer.id"
        :value="customer.id"
      >
        {{ customer.name }}
      </option>
    </select>
  </label>
  <div class="form-grid">
    <label>
      Amount received (PKR)
      <input
        v-model="form.amount"
        type="text"
        inputmode="decimal"
        pattern="\d+(\.\d{1,2})?"
        required
      />
    </label>
    <label>
      Received on
      <input
        v-model="form.date"
        type="date"
        :max="today()"
        required
      />
    </label>
    <label>
      Transaction reference
      <input
        v-model="form.reference"
        required
      />
    </label>
    <label>
      Bank / source
      <input
        v-model="form.bank"
        required
      />
    </label>
  </div>
  <label>
    Payment method
    <select v-model="form.method">
      <option
        v-for="method in Object.values(PaymentMethod)"
        :key="method"
        :value="method"
      >
        {{ method }}
      </option>
    </select>
  </label>
  <label>
    Description
    <input
      v-model="form.description"
      placeholder="Bank statement description"
    />
  </label>
  <p class="field-help">The payment enters the review queue. Balances update after allocation.</p>
</template>
