<script setup lang="ts">
  import { ActionKind } from '../config/ui.enums';

  import { computed, ref } from 'vue';
  import type { Workspace } from '../../shared/schema';
  import { account, balance, formatMoney, invoiceStatus } from '../../shared/finance';
  import type { Action } from '../types';
  import Modal from './ui/UiModal.vue';
  import Icon from './ui/UiIcon.vue';
  import Badge from './ui/UiBadge.vue';
  import EmptyState from './ui/EmptyState.vue';

  const props = defineProps<{ workspace: Workspace; customerId: string }>();
  const emit = defineEmits<{ close: []; action: [action: Action] }>();
  const customer = computed(() =>
    props.workspace.customers.find((item) => item.id === props.customerId),
  );
  const financials = computed(() => account(props.workspace, props.customerId));
  const tab = ref('invoices');
  const invoices = computed(() =>
    props.workspace.invoices.filter((item) => item.customerId === props.customerId),
  );
  const payments = computed(() =>
    props.workspace.payments.filter((item) => item.customerId === props.customerId),
  );
  const promises = computed(() =>
    props.workspace.promises.filter((item) => item.customerId === props.customerId),
  );
  const interactions = computed(() =>
    props.workspace.interactions.filter((item) => item.customerId === props.customerId),
  );
</script>
<template>
  <Modal
    :title="customer?.name ?? 'Customer account'"
    :subtitle="`${customer?.city ?? ''} · ${customer?.contact ?? ''}`"
    wide
    @close="emit('close')"
  >
    <template v-if="customer">
      <div class="profile-contact">
        <span>
          <Icon
            name="phone"
            :size="16"
          />
          {{ customer.phone }}
        </span>
        <span>
          <Icon
            name="email"
            :size="16"
          />
          {{ customer.email }}
        </span>
        <Badge :label="customer.status" />
      </div>
      <div class="profile-metrics">
        <div>
          <span>Outstanding</span>
          <strong>{{ formatMoney(financials.outstanding, true) }}</strong>
        </div>
        <div>
          <span>Overdue</span>
          <strong class="text-red">{{ formatMoney(financials.overdue, true) }}</strong>
        </div>
        <div>
          <span>Credit limit</span>
          <strong>{{ formatMoney(customer.creditLimit, true) }}</strong>
        </div>
        <div>
          <span>Available credit</span>
          <strong>{{ formatMoney(financials.available, true) }}</strong>
        </div>
      </div>
      <div class="profile-summary">
        <Icon
          name="sparkle"
          :size="22"
        />
        <p>
          {{ customer.name }} has
          {{ invoices.filter((item) => balance(item) > 0).length }} outstanding invoices.
          {{
            financials.overdue > 0
              ? `The oldest balance is ${financials.days} days overdue.`
              : 'No balances are overdue.'
          }}
          {{
            financials.broken
              ? `${financials.broken} payment promise was missed. A personal follow-up is recommended.`
              : 'Keep the relationship moving with consistent follow-ups.'
          }}
        </p>
      </div>
      <div class="profile-actions">
        <button
          class="button primary small"
          @click="emit('action', { kind: ActionKind.Interaction, customerId })"
        >
          <Icon
            name="chat"
            :size="16"
          />
          Log interaction
        </button>
        <button
          class="button small"
          @click="emit('action', { kind: ActionKind.Promise, customerId })"
        >
          Record promise
        </button>
        <button
          class="button small"
          @click="emit('action', { kind: ActionKind.Invoice, customerId })"
        >
          New invoice
        </button>
      </div>
      <div class="tabs profile-tabs">
        <button
          v-for="item in ['invoices', 'payments', 'promises', 'history']"
          :key="item"
          :class="{ active: tab === item }"
          @click="tab = item"
        >
          {{ item }}
        </button>
      </div>
      <div class="table-wrap">
        <table v-if="tab === 'invoices'">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Due</th>
              <th class="number">Outstanding</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="invoice in invoices"
              :key="invoice.id"
            >
              <td class="strong">{{ invoice.number }}</td>
              <td>{{ invoice.dueAt }}</td>
              <td class="number">{{ formatMoney(balance(invoice)) }}</td>
              <td><Badge :label="invoiceStatus(invoice)" /></td>
            </tr>
          </tbody>
        </table>
        <table v-else-if="tab === 'payments'">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Date</th>
              <th class="number">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="payment in payments"
              :key="payment.id"
            >
              <td>{{ payment.reference }}</td>
              <td>{{ payment.date }}</td>
              <td class="number">{{ formatMoney(payment.amount) }}</td>
              <td><Badge :label="payment.status" /></td>
            </tr>
          </tbody>
        </table>
        <table v-else-if="tab === 'promises'">
          <thead>
            <tr>
              <th>Promised date</th>
              <th class="number">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="promise in promises"
              :key="promise.id"
            >
              <td>{{ promise.date }}</td>
              <td class="number">{{ formatMoney(promise.amount) }}</td>
              <td><Badge :label="promise.status" /></td>
            </tr>
          </tbody>
        </table>
        <div
          v-else
          class="profile-history"
        >
          <article
            v-for="interaction in interactions"
            :key="interaction.id"
          >
            <div>
              <Badge :label="interaction.channel" />
              <small>
                {{ new Date(interaction.at).toLocaleString('en-GB') }} · {{ interaction.author }}
              </small>
            </div>
            <p>{{ interaction.message }}</p>
            <span>
              {{ interaction.outcome }}
              <template v-if="interaction.nextAction">
                · Next: {{ interaction.nextAction }}
              </template>
            </span>
          </article>
          <EmptyState
            v-if="!interactions.length"
            title="Start the conversation"
            text="Record a call, customer reply, or internal note."
          />
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
  @use '../styles/tokens' as *;

  .profile-contact {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 15px;
    color: $muted;
    font-size: 12px;
    > span {
      display: flex;
      align-items: center;
      gap: 5px;
    }
  }

  .profile-metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
    padding: 23px 0;
    > div {
      padding-right: 10px;
      border-right: 1px solid $surface-muted;
      &:last-child {
        border: none;
      }
    }
    span {
      font-size: 12px;
      color: $muted;
    }
    strong {
      display: block;
      font-size: 21px;
      font-weight: 550;
      margin-top: 10px;
      letter-spacing: -0.4px;
    }
    &.two {
      grid-template-columns: 1fr 1fr;
      padding-top: 0;
    }
  }

  .profile-summary {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    border: 1px solid $surface-muted;
    border-radius: 7px;
    padding: 15px;
    background: $surface-soft;
    color: $muted;
    svg {
      flex-shrink: 0;
    }
    p {
      font-size: 12px;
      line-height: 1.8;
    }
  }

  .profile-actions {
    display: flex;
    gap: 8px;
    margin: 23px 0 10px;
  }

  .profile-tabs {
    border-bottom: 1px solid $surface-muted;
  }

  .profile-history {
    padding-top: 15px;
    article {
      border-bottom: 1px solid $surface-soft;
      padding: 17px 0;
      > div {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 15px;
      }
      small {
        color: $muted;
        font-size: 12px;
      }
      p {
        font-size: 12px;
        line-height: 1.8;
        margin: 15px 0 12px;
      }
      > span {
        color: $muted;
        font-size: 12px;
      }
    }
  }

  @media (max-width: 760px) {
    .profile-metrics {
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      strong {
        font-size: 20px;
      }
      > div:nth-child(2) {
        border: 0;
      }
    }
    .profile-actions {
      flex-wrap: wrap;
    }
    .profile-history article > div {
      flex-wrap: wrap;
      gap: 8px;
    }
  }
</style>
