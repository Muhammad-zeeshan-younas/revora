<script setup lang="ts">
  import type { ActionForm } from './action-form.types';

  const form = defineModel<ActionForm>({ required: true });
</script>

<template>
  <label>
    Business name
    <input
      v-model="form.name"
      required
      maxlength="120"
      placeholder="e.g. Crescent Traders"
    />
  </label>
  <div class="form-grid">
    <label>
      Contact person
      <input
        v-model="form.contact"
        required
        placeholder="Full name"
      />
    </label>
    <label>
      City
      <input
        v-model="form.city"
        required
        placeholder="Lahore"
      />
    </label>
    <label>
      Email address
      <input
        v-model="form.email"
        type="email"
        required
        placeholder="accounts@company.com"
      />
    </label>
    <label>
      WhatsApp / phone
      <input
        v-model="form.phone"
        required
        pattern="\+[0-9]{10,15}"
        placeholder="+923001234567"
      />
    </label>
    <label>
      Credit limit (PKR)
      <input
        v-model="form.creditLimit"
        type="text"
        inputmode="decimal"
        pattern="\d+(\.\d{1,2})?"
        required
      />
    </label>
    <label>
      Payment terms (days)
      <input
        v-model.number="form.terms"
        type="number"
        min="0"
        max="365"
        required
      />
    </label>
    <label>
      Tax / NTN reference
      <input
        v-model="form.taxId"
        placeholder="Optional"
      />
    </label>
    <label>
      Assigned salesperson
      <input
        v-model="form.salesperson"
        required
      />
    </label>
  </div>
</template>
