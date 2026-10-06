<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { z } from 'zod';
  import {
    CommandType,
    PromiseStatus,
    ReminderStatus,
    Role,
    WhatsAppDeliveryStatus,
  } from '../../shared/enums';
  import { formatMoney } from '../../shared/finance';
  import type { Workspace } from '../../shared/schema';
  import Badge from '../components/ui/UiBadge.vue';
  import EmptyState from '../components/ui/EmptyState.vue';
  import Icon from '../components/ui/UiIcon.vue';
  import { useCustomerAccounts } from '../composables/useCustomerAccounts';
  import { notify } from '../composables/useNotifications';
  import { ActionKind } from '../config/ui.enums';
  import { mutate, saving, snapshot } from '../stores/workspace';
  import type { Action } from '../types';
  import { request } from '../lib/http-client';
  import {
    fieldDrafts,
    loadFieldDrafts,
    removeFieldDraft,
    syncFieldDrafts,
  } from '../stores/field-drafts';
  import type { FieldDraft } from '../stores/field-drafts';

  const DELIVERY_REFRESH_MS = 30_000;
  const deliveryResponseSchema = z.object({
    configured: z.boolean(),
    deliveries: z.array(
      z.object({
        jobId: z.string(),
        status: z.enum(WhatsAppDeliveryStatus),
        lastError: z.string(),
        updatedAt: z.string(),
      }),
    ),
  });

  enum CollectionTab {
    Queue = 'queue',
    Promises = 'promises',
    Drafts = 'drafts',
    Outbox = 'outbox',
  }

  enum CancellationTarget {
    Promise = 'promise',
    Reminder = 'reminder',
  }

  const props = defineProps<{ workspace: Workspace }>();
  const emit = defineEmits<{ action: [action: Action] }>();
  const tab = ref<CollectionTab>(CollectionTab.Queue);
  const query = ref('');
  const error = ref('');
  const deliveryConfigured = ref(false);
  const deliveryStatuses = ref<Record<string, { status: string; lastError: string }>>({});
  let deliveryTimer: ReturnType<typeof setInterval> | null = null;
  const { accounts, customerName } = useCustomerAccounts(() => props.workspace);
  const queue = computed(() =>
    accounts.value
      .filter(
        (customer) =>
          customer.overdue > 0 && customer.name.toLowerCase().includes(query.value.toLowerCase()),
      )
      .sort((a, b) => b.score - a.score),
  );
  const activePromiseAmount = computed(() =>
    props.workspace.promises
      .filter(
        (promise) =>
          promise.status === PromiseStatus.Pending ||
          promise.status === PromiseStatus.PartiallyKept,
      )
      .reduce((total, promise) => total + promise.amount, 0),
  );
  const outboxCount = computed(
    () => props.workspace.jobs.filter((job) => job.status !== ReminderStatus.Cancelled).length,
  );
  const canManageReminders = computed(() =>
    [Role.Owner, Role.Admin, Role.Accountant, Role.Collections].includes(
      snapshot.value?.session.user.role ?? Role.Viewer,
    ),
  );

  async function remind(customerId: string): Promise<void> {
    error.value = '';
    try {
      await mutate({ type: CommandType.QueueReminder, customerId });
      notify('Reminder queued in the local outbox.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not queue reminder.';
    }
  }

  async function cancel(id: string, kind: CancellationTarget): Promise<void> {
    error.value = '';
    try {
      await mutate(
        kind === CancellationTarget.Promise
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

  async function loadDeliveries(): Promise<void> {
    try {
      const result = await request('/workspace/whatsapp-deliveries', deliveryResponseSchema);
      deliveryConfigured.value = result.configured;
      deliveryStatuses.value = Object.fromEntries(
        result.deliveries.map((item) => [
          item.jobId,
          {
            status: item.status,
            lastError: item.lastError,
          },
        ]),
      );
    } catch {
      // The outbox remains usable when the delivery status endpoint is unavailable.
    }
  }

  async function retryDelivery(jobId: string): Promise<void> {
    error.value = '';
    try {
      await request(
        `/workspace/whatsapp-deliveries/${encodeURIComponent(jobId)}/retry`,
        z.object({ ok: z.boolean() }),
        {},
      );
      await loadDeliveries();
      notify('Confirmed failed reminder queued for another attempt.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not retry this reminder.';
    }
  }

  function draftSummary(draft: FieldDraft): string {
    if (draft.command.type === CommandType.CreatePromise) {
      return `${customerName(draft.command.customerId)} · Promise of ${formatMoney(draft.command.amount)} due ${draft.command.date}`;
    }
    if (draft.command.type === CommandType.CreateInteraction) {
      return `${customerName(draft.command.interaction.customerId)} · ${draft.command.interaction.channel}: ${draft.command.interaction.message}`;
    }

    return 'Field draft';
  }

  async function syncDrafts(): Promise<void> {
    error.value = '';
    try {
      await syncFieldDrafts();
      notify('Field drafts synced to the workspace.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not sync field drafts.';
    }
  }

  onMounted(() => {
    loadFieldDrafts();
    void loadDeliveries();
    deliveryTimer = setInterval(() => void loadDeliveries(), DELIVERY_REFRESH_MS);
  });

  onBeforeUnmount(() => {
    if (deliveryTimer) {
      clearInterval(deliveryTimer);
    }
  });
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
        {{ formatMoney(activePromiseAmount, true) }}
      </strong>
      <small>Track every commitment to completion</small>
    </article>
    <article class="panel mini-stat">
      <span>Reminders in outbox</span>
      <strong>
        {{ outboxCount }}
        <small>prepared or queued</small>
      </strong>
      <small>
        {{
          deliveryConfigured ? 'WhatsApp delivery connected' : 'WhatsApp delivery is not connected'
        }}
      </small>
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
          :class="{ active: tab === CollectionTab.Queue }"
          @click="tab = CollectionTab.Queue"
        >
          Collection queue
          <span>{{ queue.length }}</span>
        </button>
        <button
          :class="{ active: tab === CollectionTab.Promises }"
          @click="tab = CollectionTab.Promises"
        >
          Promises to pay
          <span>{{ workspace.promises.length }}</span>
        </button>
        <button
          :class="{ active: tab === CollectionTab.Drafts }"
          @click="tab = CollectionTab.Drafts"
        >
          Field drafts
          <span>{{ fieldDrafts.length }}</span>
        </button>
        <button
          :class="{ active: tab === CollectionTab.Outbox }"
          @click="tab = CollectionTab.Outbox"
        >
          Reminder outbox
          <span>{{ workspace.jobs.length }}</span>
        </button>
      </div>
    </div>
    <template v-if="tab === CollectionTab.Queue">
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
              v-if="canManageReminders"
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
    <template v-else-if="tab === CollectionTab.Promises">
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
                    canManageReminders &&
                    [
                      PromiseStatus.Pending,
                      PromiseStatus.PartiallyKept,
                      PromiseStatus.Broken,
                    ].includes(promise.status)
                  "
                  class="text-button subtle"
                  :disabled="saving"
                  @click="cancel(promise.id, CancellationTarget.Promise)"
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
    <template v-else-if="tab === CollectionTab.Drafts">
      <div class="info-note inline-note">
        <Icon
          name="phone"
          :size="22"
        />
        <p>
          Drafts stay on this device until you sync or remove them. Keep this browser private when
          recording customer conversations.
        </p>
      </div>
      <div
        v-if="fieldDrafts.length"
        class="table-toolbar"
      >
        <strong>{{ fieldDrafts.length }} draft(s) waiting</strong>
        <button
          class="button small primary"
          :disabled="saving"
          @click="syncDrafts"
        >
          Sync field drafts
        </button>
      </div>
      <div class="outbox-list">
        <article
          v-for="draft in fieldDrafts"
          :key="draft.id"
          class="outbox-card"
        >
          <header>
            <strong>
              {{
                draft.command.type === CommandType.CreatePromise ? 'Payment promise' : 'Interaction'
              }}
            </strong>
            <small>{{ new Date(draft.createdAt).toLocaleString('en-GB') }}</small>
          </header>
          <p>{{ draftSummary(draft) }}</p>
          <footer>
            <button
              type="button"
              class="text-button subtle"
              :disabled="saving"
              @click="removeFieldDraft(draft.id)"
            >
              Remove draft
            </button>
          </footer>
        </article>
      </div>
      <EmptyState
        v-if="!fieldDrafts.length"
        title="No field drafts"
        text="Log an interaction or promise and choose Save field draft when working without a connection."
      />
    </template>
    <template v-else>
      <div class="info-note inline-note">
        <Icon
          name="whatsapp"
          :size="22"
        />
        <p>
          {{
            deliveryConfigured
              ? 'Prepared reminders are sent with your approved WhatsApp template. Delivery and reply updates appear here.'
              : 'Reminders are prepared locally. Connect a WhatsApp Business account before sending. You can inspect and copy each message here.'
          }}
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
            <Badge :label="deliveryStatuses[job.id]?.status ?? job.status" />
          </header>
          <p>{{ job.message }}</p>
          <p
            v-if="deliveryStatuses[job.id]?.lastError"
            class="small muted"
          >
            {{ deliveryStatuses[job.id]?.lastError }}
          </p>
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
              v-if="
                canManageReminders &&
                deliveryStatuses[job.id]?.status === WhatsAppDeliveryStatus.Failed
              "
              type="button"
              class="text-button"
              @click="retryDelivery(job.id)"
            >
              Retry send
            </button>
            <button
              v-if="
                canManageReminders &&
                job.status !== ReminderStatus.Cancelled &&
                (!deliveryStatuses[job.id] ||
                  deliveryStatuses[job.id]?.status === WhatsAppDeliveryStatus.Failed)
              "
              class="text-button subtle"
              :disabled="saving"
              @click="cancel(job.id, CancellationTarget.Reminder)"
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

<style scoped lang="scss" src="./CollectionsPage.scss"></style>
