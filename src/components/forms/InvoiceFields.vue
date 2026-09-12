<script setup lang="ts">
  import type { ActionForm } from './action-form.types';
  import type { Workspace } from '../../../shared/schema';
  import { today } from '../../../shared/finance';

  const form = defineModel<ActionForm>({ required: true });
  defineProps<{ workspace: Workspace }>();
</script>

<template>
  <label>
    Customer
    <select
      v-model="form.customerId"
      required
    >
      <option
        disabled
        value=""
      >
        Select a customer
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
  <div
    v-if="!workspace.customers.length"
    class="info-note"
  >
    Add or import a customer before creating an invoice.
  </div>
  <div class="form-grid">
    <label>
      Invoice number
      <input
        v-model="form.number"
        required
      />
    </label>
    <label>
      Amount (PKR)
      <input
        v-model="form.amount"
        type="text"
        inputmode="decimal"
        pattern="\d+(\.\d{1,2})?"
        required
        placeholder="150,000"
      />
    </label>
    <label>
      Invoice date
      <input
        v-model="form.issuedAt"
        type="date"
        :max="today()"
        required
      />
    </label>
    <label>
      Due date
      <input
        v-model="form.dueAt"
        type="date"
        :min="form.issuedAt"
        required
      />
    </label>
  </div>
  <label>
    ERP / external reference
    <input
      v-model="form.reference"
      placeholder="Optional reference"
    />
  </label>
</template>
