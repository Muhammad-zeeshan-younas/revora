<script setup lang="ts">
  import { ActionKind } from '../config/ui.enums';

  import { CommandType, PromiseStatus, ReminderStatus } from '../../shared/enums';

  import { computed, ref } from 'vue';
  import type { Workspace } from '../../shared/schema';
  import { account, formatMoney } from '../../shared/finance';
  import type { Action } from '../types';
  import { notify } from '../composables/useNotifications';
  import { mutate, saving } from '../stores/workspace';
  import Icon from '../components/ui/UiIcon.vue';
  import Badge from '../components/ui/UiBadge.vue';
  import EmptyState from '../components/ui/EmptyState.vue';

  const props = defineProps<{ workspace: Workspace }>();
  const emit = defineEmits<{ action: [action: Action] }>();
  const tab = ref('queue');
  const query = ref('');
  const error = ref('');
  const queue = computed(() =>
    props.workspace.customers
      .map((customer) => ({ ...customer, ...account(props.workspace, customer.id) }))
      .filter(
        (customer) =>
          customer.overdue > 0 && customer.name.toLowerCase().includes(query.value.toLowerCase()),
      )
      .sort((a, b) => b.score - a.score),
  );
  const customerName = (id: string): string =>
    props.workspace.customers.find((customer) => customer.id === id)?.name ?? '';

  async function remind(customerId: string): Promise<void> {
    error.value = '';
    try {
      await mutate({ type: CommandType.QueueReminder, customerId });
      notify('Reminder queued in the local outbox.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not queue reminder.';
    }
  }

  async function cancel(id: string, kind: ActionKind.Promise | 'reminder'): Promise<void> {
    error.value = '';
    try {
      await mutate(
        kind === ActionKind.Promise
          ? { type: CommandType.CancelPromise, promiseId: id }
          : { type: CommandType.CancelReminder, jobId: id },
      );
      notify('Cancelled successfully.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not cancel.';
    }
  }

  async function copyMessage(message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(message);
      notify('Reminder copied.');
    } catch {
      error.value = 'Clipboard is unavailable. Select and copy the reminder text.';
    }
  }
</script>
<template>
  <div class="summary-grid">
    <article class="panel mini-stat">
      <span>Accounts to follow up</span>
      <strong>
        {{ queue.length }}
        <small>customers</small>
      </strong>
      <small>Prioritized by overdue balance and history</small>
    </article>
    <article class="panel mini-stat">
      <span>Active payment promises</span>
      <strong>
        {{
          formatMoney(
            workspace.promises
              .filter(
                (p) =>
                  p.status === PromiseStatus.Pending || p.status === PromiseStatus.PartiallyKept,
              )
              .reduce((sum, p) => sum + p.amount, 0),
            true,
          )
        }}
      </strong>
      <small>Track every commitment to completion</small>
    </article>
    <article class="panel mini-stat">
      <span>Reminders in outbox</span>
      <strong>
        {{ workspace.jobs.filter((job) => job.status !== ReminderStatus.Cancelled).length }}
        <small>prepared or queued</small>
      </strong>
      <small>WhatsApp delivery is not connected</small>
    </article>
  </div>
  <p
    v-if="error"
    class="error-banner"
    role="alert"
  >
    {{ error }}
  </p>
  <section class="panel">
    <div class="records-toolbar">
      <div class="tabs">
        <button
          :class="{ active: tab === 'queue' }"
          @click="tab = 'queue'"
        >
          Collection queue
          <span>{{ queue.length }}</span>
        </button>
        <button
          :class="{ active: tab === 'promises' }"
          @click="tab = 'promises'"
        >
          Promises to pay
        </button>
        <button
          :class="{ active: tab === 'outbox' }"
          @click="tab = 'outbox'"
        >
          Reminder outbox
        </button>
      </div>
    </div>
    <template v-if="tab === 'queue'">
      <div class="table-toolbar">
        <div class="search-field">
          <Icon
            name="search"
            :size="18"
          />
          <input
            v-model="query"
            aria-label="Search collection queue"
            placeholder="Find a customer…"
          />
        </div>
        <span class="small muted">
          <Icon
            name="filter"
            :size="15"
          />
          Sorted by collection priority
        </span>
      </div>
      <div class="collection-cards">
        <article
          v-for="customer in queue"
          :key="customer.id"
          class="collection-card"
        >
          <div class="collection-account">
            <span class="avatar">{{ customer.name.slice(0, 2).toUpperCase() }}</span>
            <div>
              <button
                class="text-button subtle strong"
                @click="emit('action', { kind: ActionKind.Profile, customerId: customer.id })"
              >
                {{ customer.name }}
              </button>
              <p>{{ customer.city }} · {{ customer.salesperson }}</p>
            </div>
            <Badge :label="customer.priority" />
          </div>
          <div class="collection-values">
            <div>
              <span>Overdue balance</span>
              <strong>{{ formatMoney(customer.overdue) }}</strong>
            </div>
            <div>
              <span>Oldest overdue</span>
              <strong>{{ customer.days }} days</strong>
            </div>
            <div>
              <span>Credit utilization</span>
              <strong>{{ Math.round(customer.utilization) }}%</strong>
            </div>
          </div>
          <div class="collection-reason">
            <Icon
              :name="customer.broken ? 'warning' : 'sparkle'"
              :size="17"
            />
            <span>
              {{
                customer.broken
                  ? `${customer.broken} missed promise. A personal follow-up is recommended.`
                  : customer.days > 60
                    ? 'Long-outstanding balance. Review with the accounts manager.'
                    : 'A friendly reminder can help keep this account on track.'
              }}
            </span>
          </div>
          <footer>
            <button
              class="button small"
              @click="emit('action', { kind: ActionKind.Interaction, customerId: customer.id })"
            >
              <Icon
                name="chat"
                :size="16"
              />
              Log interaction
            </button>
            <button
              class="button small"
              @click="emit('action', { kind: ActionKind.Promise, customerId: customer.id })"
            >
              <Icon
                name="calendar"
                :size="16"
              />
              Record promise
            </button>
            <button
              class="button small primary"
              :disabled="saving"
              @click="remind(customer.id)"
            >
              <Icon
                name="whatsapp"
                :size="16"
              />
              Queue reminder
            </button>
          </footer>
        </article>
      </div>
      <EmptyState
        v-if="!queue.length"
        title="You’re all caught up"
        text="No overdue accounts match this view."
      />
    </template>
    <template v-else-if="tab === 'promises'">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th class="number">Promised amount</th>
              <th>Promised date</th>
              <th>Status</th>
              <th>Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="promise in workspace.promises"
              :key="promise.id"
            >
              <td class="strong">{{ customerName(promise.customerId) }}</td>
              <td class="number">{{ formatMoney(promise.amount) }}</td>
              <td>{{ promise.date }}</td>
              <td><Badge :label="promise.status" /></td>
              <td class="truncate">{{ promise.note }}</td>
              <td>
                <button
                  v-if="
                    [
                      PromiseStatus.Pending,
                      PromiseStatus.PartiallyKept,
                      PromiseStatus.Broken,
                    ].includes(promise.status)
                  "
                  class="text-button subtle"
                  :disabled="saving"
                  @click="cancel(promise.id, ActionKind.Promise)"
                >
                  Cancel
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState
        v-if="!workspace.promises.length"
        title="Every promise matters"
        text="Record customer commitments from the collection queue."
      />
    </template>
    <template v-else>
      <div class="info-note inline-note">
        <Icon
          name="whatsapp"
          :size="22"
        />
        <p>
          Reminders are prepared locally. Connect a WhatsApp Business delivery provider before
          sending to customers. You can inspect and copy each message here.
        </p>
      </div>
      <div class="outbox-list">
        <article
          v-for="job in workspace.jobs"
          :key="job.id"
          class="outbox-card"
        >
          <header>
            <strong>{{ customerName(job.customerId) }}</strong>
            <Badge :label="job.status" />
          </header>
          <p>{{ job.message }}</p>
          <footer>
            <small>
              {{ new Date(job.scheduledAt).toLocaleString('en-GB') }} · {{ job.createdBy }}
            </small>
            <button
              class="text-button"
              @click="copyMessage(job.message)"
            >
              <Icon
                name="copy"
                :size="16"
              />
              Copy
            </button>
            <button
              v-if="job.status !== ReminderStatus.Cancelled"
              class="text-button subtle"
              :disabled="saving"
              @click="cancel(job.id, 'reminder')"
            >
              Cancel
            </button>
          </footer>
        </article>
      </div>
      <EmptyState
        v-if="!workspace.jobs.length"
        title="Your outbox is clear"
        text="Queue a reminder from an overdue customer’s collection card."
      />
    </template>
  </section>
</template>

<style scoped lang="scss">
  @use '../styles/tokens' as *;

  .collection-cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    padding: 0 20px 20px;
  }

  .collection-card {
    border: 1px solid $surface-muted;
    border-radius: 8px;
    padding: 20px;
    footer {
      display: flex;
      gap: 7px;
      flex-wrap: wrap;
      padding-top: 16px;
    }
  }

  .collection-account {
    display: flex;
    gap: 10px;
    align-items: center;
    > div {
      flex: 1;
    }
    p {
      margin-top: 5px;
      font-size: 12px;
      color: $muted;
    }
  }

  .collection-values {
    display: flex;
    gap: 20px;
    padding: 25px 0 18px;
    > div {
      flex: 1;
    }
    span {
      font-size: 12px;
      color: $muted;
      display: block;
      margin-bottom: 8px;
    }
    strong {
      font-size: 16px;
      font-weight: 550;
    }
  }

  .collection-reason {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    background: $surface-soft;
    padding: 14px;
    border-radius: 5px;
    color: $muted;
    font-size: 12px;
    line-height: 1.75;
    svg {
      flex-shrink: 0;
    }
  }

  .outbox-list {
    padding: 0 20px 20px;
  }

  .outbox-card {
    padding: 20px;
    border: 1px solid $surface-muted;
    border-radius: 8px;
    margin-top: 15px;
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    > p {
      line-height: 1.8;
      color: $muted;
      font-size: 12px;
      padding: 16px 0;
      max-width: 750px;
      white-space: pre-wrap;
    }
    footer {
      display: flex;
      align-items: center;
      gap: 14px;
      small {
        margin-right: auto;
        font-size: 12px;
        color: $muted;
      }
    }
  }

  @media (max-width: 1200px) {
    .collection-cards {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .collection-cards {
      padding: 0 13px 15px;
    }
    .collection-card {
      padding: 16px;
      footer {
        gap: 6px;
      }
      footer .button {
        font-size: 12px;
      }
    }
    .collection-values {
      gap: 10px;
      strong {
        font-size: 15px;
      }
      span {
        font-size: 12px;
      }
    }
    .outbox-card footer {
      flex-wrap: wrap;
      small {
        width: 100%;
      }
    }
  }

  @media (max-width: 390px) {
    .collection-values strong {
      font-size: 13px;
    }
  }

  .collection-values span {
    color: $muted;
    font-size: 12px;
  }

  .collection-account p,
  .collection-reason {
    color: $muted;
  }

  @media (max-width: 760px) {
    .collection-values span {
      font-size: 12px;
    }
  }
</style>
