<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { CollectionPriority } from '../../shared/enums';
  import { recordPageSchema } from '../../shared/record-page';
  import type { RecordPageResponse } from '../../shared/record-page';
  import { csvExport } from '../../shared/csv';
  import {
    AttachmentTarget,
    CustomerStatus,
    ImportKind,
    InteractionOutcome,
    InvoiceStatus,
    PaymentStatus,
    Role,
  } from '../../shared/enums';
  import { balance, formatMoney, invoiceStatus, suggestMatch } from '../../shared/finance';
  import type { Customer, Invoice, Payment, Workspace } from '../../shared/schema';
  import Badge from '../components/ui/UiBadge.vue';
  import EmptyState from '../components/ui/EmptyState.vue';
  import Icon from '../components/ui/UiIcon.vue';
  import { useCustomerAccounts } from '../composables/useCustomerAccounts';
  import { notify } from '../composables/useNotifications';
  import { ActionKind, PageId, RecordSort } from '../config/ui.enums';
  import { download } from '../lib/download';
  import { request } from '../lib/http-client';
  import type { Action } from '../types';
  import { snapshot } from '../stores/workspace';

  enum RecordFilter {
    All = 'All',
    OverLimit = 'Over limit',
  }

  enum ActivityFilter {
    Payment = 'payment',
    Invoice = 'invoice',
    Promise = 'promise',
    Reminder = 'reminder',
    Credit = 'credit',
    Member = 'member',
  }

  type RecordPage =
    PageId.Customers | PageId.Invoices | PageId.Payments | PageId.Credit | PageId.Activity;

  const PAGE_SIZE = 10;
  const FILTER_TABS: Record<RecordPage, readonly string[]> = {
    [PageId.Customers]: [
      RecordFilter.All,
      CustomerStatus.Active,
      InvoiceStatus.Overdue,
      CustomerStatus.OnHold,
    ],
    [PageId.Invoices]: [
      RecordFilter.All,
      InvoiceStatus.Open,
      InvoiceStatus.Overdue,
      InvoiceStatus.Paid,
      InvoiceStatus.Disputed,
    ],
    [PageId.Payments]: [
      RecordFilter.All,
      PaymentStatus.Unmatched,
      PaymentStatus.Partial,
      PaymentStatus.Matched,
      PaymentStatus.Reversed,
    ],
    [PageId.Credit]: [RecordFilter.All, RecordFilter.OverLimit, InvoiceStatus.Overdue],
    [PageId.Activity]: [
      RecordFilter.All,
      ActivityFilter.Payment,
      ActivityFilter.Invoice,
      ActivityFilter.Promise,
      ActivityFilter.Reminder,
      ActivityFilter.Credit,
      ActivityFilter.Member,
    ],
  };

  const props = defineProps<{
    workspace: Workspace;
    page: RecordPage;
    remote?: boolean;
  }>();
  const emit = defineEmits<{ action: [action: Action] }>();
  const query = ref('');
  const filter = ref<string>(RecordFilter.All);
  const sort = ref(RecordSort.Name);
  const currentPage = ref(1);
  const { accounts: localAccounts, customerName: localCustomerName } = useCustomerAccounts(
    () => props.workspace,
  );
  const remotePage = ref<RecordPageResponse | null>(null);
  const remoteLoading = ref(false);
  const remoteError = ref('');
  const cursorStack = ref<number[]>([-1]);
  let remoteRequest = 0;
  const remoteItems = computed(() => remotePage.value?.items ?? []);
  const accounts = computed(() =>
    props.remote
      ? remoteItems.value
          .filter((item): item is Customer => 'name' in item)
          .map((customer) => ({
            ...customer,
            ...(remotePage.value?.customerSummaries[customer.id] ?? {
              outstanding: 0,
              overdue: 0,
              days: 0,
              broken: 0,
              utilization: 0,
              available: customer.creditLimit,
              score: 0,
              priority: CollectionPriority.Normal,
            }),
          }))
      : localAccounts.value,
  );

  function customerName(id: string): string {
    return remotePage.value?.customerNames[id] ?? localCustomerName(id);
  }

  async function loadRemote(cursor = -1): Promise<void> {
    if (!props.remote) {return;}
    const requestNumber = ++remoteRequest;
    remoteLoading.value = true;
    remotePage.value = null;
    remoteError.value = '';
    const params = new URLSearchParams({
      cursor: String(cursor),
      limit: String(PAGE_SIZE),
      search: query.value.trim(),
      status: filter.value === RecordFilter.All ? '' : filter.value,
    });
    try {
      const result = await request(`/workspace/records/${props.page}?${params}`, recordPageSchema);
      if (requestNumber === remoteRequest) {remotePage.value = result;}
    } catch (cause) {
      if (requestNumber === remoteRequest) {
        remotePage.value = null;
        remoteError.value = cause instanceof Error ? cause.message : 'Could not load records.';
      }
    } finally {
      if (requestNumber === remoteRequest) {remoteLoading.value = false;}
    }
  }

  function nextRemotePage(): void {
    const cursor = remotePage.value?.nextCursor;
    if (cursor === null || cursor === undefined) {return;}
    cursorStack.value.push(cursor);
    currentPage.value++;
    void loadRemote(cursor);
  }

  function previousRemotePage(): void {
    if (currentPage.value <= 1) {return;}
    cursorStack.value.pop();
    currentPage.value--;
    void loadRemote(cursorStack.value.at(-1) ?? -1);
  }

  watch([() => props.remote, () => props.page, query, filter], (_value, _oldValue, onCleanup) => {
    remoteRequest++;
    remotePage.value = null;
    cursorStack.value = [-1];
    currentPage.value = 1;
    if (!props.remote) {return;}
    const timer = window.setTimeout(() => void loadRemote(), query.value ? 250 : 0);
    onCleanup(() => window.clearTimeout(timer));
  }, { immediate: true });
  const searchTerm = computed(() => query.value.trim().toLowerCase());
  const canEditFinance = computed(() =>
    [Role.Owner, Role.Admin, Role.Accountant].includes(
      snapshot.value?.session.user.role ?? Role.Viewer,
    ),
  );
  const customerRows = computed(() =>
    (props.remote ? accounts.value : accounts.value
      .filter(
        (customer) =>
          matches(`${customer.name} ${customer.city} ${customer.contact}`) &&
          matchesCustomerFilter(customer),
      )
      .sort((a, b) =>
        sort.value === RecordSort.Balance
          ? b.outstanding - a.outstanding
          : a.name.localeCompare(b.name),
      )),
  );
  const invoiceRows = computed(() =>
    (props.remote
      ? remoteItems.value.filter((item): item is Invoice => 'number' in item)
      : props.workspace.invoices
      .filter(
        (invoice) =>
          matches(`${invoice.number} ${customerName(invoice.customerId)}`) &&
          (filter.value === RecordFilter.All || invoiceStatus(invoice) === filter.value),
      )
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))),
  );
  const paymentRows = computed(() =>
    (props.remote
      ? remoteItems.value.filter((item): item is Payment => 'date' in item)
      : props.workspace.payments
      .filter(
        (payment) =>
          matches(
            `${payment.reference} ${payment.description} ${customerName(payment.customerId)}`,
          ) &&
          (filter.value === RecordFilter.All || payment.status === filter.value),
      )
      .sort((a, b) => b.date.localeCompare(a.date))),
  );
  const auditRows = computed(() =>
    props.workspace.audit.filter(
      (event) =>
        matches(`${event.detail} ${event.actor}`) &&
        (filter.value === RecordFilter.All || event.action.startsWith(filter.value)),
    ),
  );
  const count = computed(() => {
    switch (props.page) {
      case PageId.Invoices:
        return invoiceRows.value.length;
      case PageId.Payments:
        return paymentRows.value.length;
      case PageId.Activity:
        return auditRows.value.length;
      default:
        return customerRows.value.length;
    }
  });
  const pages = computed(() => Math.max(1, Math.ceil(count.value / PAGE_SIZE)));
  const offset = computed(() => props.remote ? 0 : (Math.min(currentPage.value, pages.value) - 1) * PAGE_SIZE);
  const tabs = computed(() => FILTER_TABS[props.page]);
  const tabCounts = computed(() => {
    const counts = new Map(tabs.value.map((tab) => [tab, 0]));
    const increment = (tab: string): void => {
      counts.set(tab, (counts.get(tab) ?? 0) + 1);
    };

    if (props.remote) {return counts;}
    if (props.page === PageId.Invoices) {
      for (const invoice of props.workspace.invoices) {
        increment(RecordFilter.All);
        increment(invoiceStatus(invoice));
      }
    } else if (props.page === PageId.Payments) {
      for (const payment of props.workspace.payments) {
        increment(RecordFilter.All);
        increment(payment.status);
      }
    } else if (props.page === PageId.Activity) {
      for (const event of props.workspace.audit) {
        for (const tab of tabs.value) {
          if (tab === RecordFilter.All || event.action.startsWith(tab)) {
            increment(tab);
          }
        }
      }
    } else {
      for (const customer of accounts.value) {
        increment(RecordFilter.All);
        increment(customer.status);
        if (customer.overdue > 0) {
          increment(InvoiceStatus.Overdue);
        }
        if (customer.available < 0) {
          increment(RecordFilter.OverLimit);
        }
      }
    }

    return counts;
  });
  const exposure = computed(() =>
    customerRows.value.reduce((sum, customer) => sum + customer.outstanding, 0),
  );
  const overLimitCount = computed(
    () => accounts.value.filter((customer) => customer.available < 0).length,
  );
  const paymentSuggestions = computed(
    () =>
      new Map(
        paymentRows.value
          .slice(offset.value, offset.value + PAGE_SIZE)
          .map((payment) => [payment.id, suggestMatch(props.workspace, payment)]),
      ),
  );

  function matches(text: string): boolean {
    return text.toLowerCase().includes(searchTerm.value);
  }

  function matchesCustomerFilter(customer: (typeof accounts.value)[number]): boolean {
    if (filter.value === RecordFilter.All) {
      return true;
    }

    if (filter.value === InvoiceStatus.Overdue) {
      return customer.overdue > 0;
    }

    if (filter.value === RecordFilter.OverLimit) {
      return customer.available < 0;
    }

    return customer.status === filter.value;
  }

  function exportRows(): void {
    if (props.page === PageId.Customers || props.page === PageId.Credit) {
      download(
        `revora-${props.page}.csv`,
        csvExport(
          [
            'Customer',
            'City',
            'Outstanding PKR',
            'Overdue PKR',
            'Credit limit PKR',
            'Available PKR',
          ],
          customerRows.value.map((customer) => [
            customer.name,
            customer.city,
            String(customer.outstanding / 100),
            String(customer.overdue / 100),
            String(customer.creditLimit / 100),
            String(customer.available / 100),
          ]),
        ),
      );
    } else if (props.page === PageId.Invoices) {
      download(
        'revora-invoices.csv',
        csvExport(
          ['Invoice', 'Customer', 'Due', 'Outstanding PKR', 'Status'],
          invoiceRows.value.map((invoice) => [
            invoice.number,
            customerName(invoice.customerId),
            invoice.dueAt,
            String(balance(invoice) / 100),
            invoiceStatus(invoice),
          ]),
        ),
      );
    } else if (props.page === PageId.Payments) {
      download(
        'revora-payments.csv',
        csvExport(
          ['Date', 'Reference', 'Customer', 'Amount PKR', 'Status'],
          paymentRows.value.map((payment) => [
            payment.date,
            payment.reference,
            customerName(payment.customerId),
            String(payment.amount / 100),
            payment.status,
          ]),
        ),
      );
    } else {
      download(
        'revora-audit.csv',
        csvExport(
          ['Timestamp', 'Actor', 'Action', 'Detail'],
          auditRows.value.map((event) => [event.at, event.actor, event.action, event.detail]),
        ),
      );
    }
    notify(props.remote ? 'Current page exported.' : 'Filtered report exported.');
  }

  watch([query, sort, filter], () => {
    currentPage.value = 1;
  });

  watch(
    () => props.page,
    () => {
      filter.value = RecordFilter.All;
      query.value = '';
      currentPage.value = 1;
    },
  );
</script>
<template>
  <div
    v-if="page === PageId.Credit"
    class="summary-grid"
  >
    <article class="panel mini-stat">
      <span>Current exposure</span>
      <strong>{{ formatMoney(exposure, true) }}</strong>
      <small>Across your customer portfolio</small>
    </article>
    <article class="panel mini-stat">
      <span>Total credit extended</span>
      <strong>
        {{
          formatMoney(
            workspace.customers.reduce((sum, customer) => sum + customer.creditLimit, 0),
            true,
          )
        }}
      </strong>
      <small>Approved by your team</small>
    </article>
    <article class="panel mini-stat">
      <span>Accounts over limit</span>
      <strong>
        {{ overLimitCount }}
      </strong>
      <small>Review before accepting new orders</small>
    </article>
  </div>
  <div
    v-if="page === PageId.Payments"
    class="insight-strip"
  >
    <span class="insight-icon">
      <Icon
        name="sparkle"
        :size="23"
      />
    </span>
    <div>
      <strong>Your next match could be a click away.</strong>
      <p>
        Reference and amount matching suggests allocations. Your team reviews and approves every
        match.
      </p>
    </div>
    <button
      class="text-button"
      @click="emit('action', { kind: ActionKind.Payment })"
    >
      Record payment
      <Icon
        name="plus"
        :size="18"
      />
    </button>
  </div>
  <section class="panel records-panel">
    <div class="records-toolbar">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab"
          :class="{ active: filter === tab }"
          @click="
            filter = tab;
            currentPage = 1;
          "
        >
          {{
            tab === RecordFilter.All
              ? `All ${page === PageId.Credit ? 'accounts' : page === PageId.Activity ? 'activity' : page}`
              : tab
          }}
          <span v-if="!remote">{{ tabCounts.get(tab) ?? 0 }}</span>
        </button>
      </div>
    </div>
    <div class="table-toolbar">
      <div class="search-field">
        <Icon
          name="search"
          :size="18"
        />
        <input
          v-model="query"
          :aria-label="`Search ${page}`"
          :placeholder="`Search ${page === PageId.Credit ? 'customers' : page}…`"
          @input="currentPage = 1"
        />
      </div>
      <div class="table-tools">
        <button
          v-if="page === PageId.Payments && canEditFinance"
          type="button"
          class="button small"
          @click="emit('action', { kind: ActionKind.BankReconciliation })"
        >
          Reconcile statement
        </button>
        <select
          v-if="!remote && (page === PageId.Customers || page === PageId.Credit)"
          v-model="sort"
          class="compact-select"
          aria-label="Sort customers"
        >
          <option :value="RecordSort.Name">Name A–Z</option>
          <option :value="RecordSort.Balance">Highest balance</option>
        </select>
        <button
          v-if="page === PageId.Customers || page === PageId.Invoices"
          class="button small"
          @click="
            emit('action', {
              kind: ActionKind.Import,
              importKind: page === PageId.Customers ? ImportKind.Customers : ImportKind.Invoices,
            })
          "
        >
          <Icon
            name="upload"
            :size="16"
          />
          Import CSV
        </button>
        <button
          class="button small"
          @click="exportRows"
        >
          <Icon
            name="download"
            :size="16"
          />
          {{ remote ? 'Export page' : 'Export' }}
        </button>
      </div>
    </div>
    <p v-if="remoteLoading" role="status">Loading records…</p>
    <div v-if="remoteError" class="error-banner" role="alert">
      {{ remoteError }}
      <button class="text-button" @click="loadRemote(cursorStack.at(-1) ?? -1)">Retry</button>
    </div>
    <div class="table-wrap">
      <table v-if="page === PageId.Customers">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Contact</th>
            <th class="number">Outstanding</th>
            <th class="number">Overdue</th>
            <th>Payment terms</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(customer, index) in customerRows.slice(offset, offset + PAGE_SIZE)"
            :key="customer.id"
          >
            <td>
              <button
                class="customer-cell"
                @click="emit('action', { kind: ActionKind.Profile, customerId: customer.id })"
              >
                <span :class="['avatar', `avatar-${index % 5}`]">
                  {{ customer.name.slice(0, 2).toUpperCase() }}
                </span>
                <span>
                  <strong>{{ customer.name }}</strong>
                  <small>{{ customer.city }}</small>
                </span>
              </button>
            </td>
            <td>
              <div class="stacked-cell">
                <span>{{ customer.contact }}</span>
                <small>{{ customer.phone }}</small>
              </div>
            </td>
            <td class="number strong">{{ formatMoney(customer.outstanding) }}</td>
            <td
              class="number"
              :class="{ 'text-red': customer.overdue > 0 }"
            >
              {{ formatMoney(customer.overdue) }}
            </td>
            <td>Net {{ customer.terms }}</td>
            <td><Badge :label="customer.status" /></td>
            <td>
              <button
                class="icon-button"
                :aria-label="`View ${customer.name}`"
                @click="emit('action', { kind: ActionKind.Profile, customerId: customer.id })"
              >
                <Icon
                  name="right"
                  :size="16"
                />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <table v-else-if="page === PageId.Invoices">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Due date</th>
            <th class="number">Amount</th>
            <th class="number">Outstanding</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="invoice in invoiceRows.slice(offset, offset + PAGE_SIZE)"
            :key="invoice.id"
          >
            <td class="strong invoice-id">
              <Icon
                name="invoice"
                :size="18"
              />
              {{ invoice.number }}
            </td>
            <td>
              <button
                class="text-button subtle"
                @click="
                  emit('action', { kind: ActionKind.Profile, customerId: invoice.customerId })
                "
              >
                {{ customerName(invoice.customerId) }}
              </button>
            </td>
            <td>{{ invoice.dueAt }}</td>
            <td class="number">{{ formatMoney(invoice.amount) }}</td>
            <td class="number strong">{{ formatMoney(balance(invoice)) }}</td>
            <td><Badge :label="invoiceStatus(invoice)" /></td>
            <td>
              <button
                type="button"
                class="text-button subtle"
                @click="
                  emit('action', {
                    kind: ActionKind.Attachments,
                    target: AttachmentTarget.Invoice,
                    targetId: invoice.id,
                    label: invoice.number,
                  })
                "
              >
                Documents
              </button>
              <button
                v-if="canEditFinance"
                type="button"
                class="text-button subtle"
                @click="
                  emit('action', { kind: ActionKind.InvoiceCorrection, invoiceId: invoice.id })
                "
              >
                Corrections
              </button>
              <button
                v-if="canEditFinance && balance(invoice) > 0"
                class="text-button"
                @click="emit('action', { kind: ActionKind.Dispute, invoiceId: invoice.id })"
              >
                {{
                  invoice.status === InvoiceStatus.Disputed ? 'Resolve' : InteractionOutcome.Dispute
                }}
              </button>
              <span
                v-else-if="balance(invoice) <= 0"
                class="muted"
              >
                Settled
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <table v-else-if="page === PageId.Payments">
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Customer / description</th>
            <th>Date</th>
            <th class="number">Amount</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="payment in paymentRows.slice(offset, offset + PAGE_SIZE)"
            :key="payment.id"
          >
            <td>
              <div class="stacked-cell">
                <strong>{{ payment.reference }}</strong>
                <small>{{ payment.bank }} · {{ payment.method }}</small>
              </div>
            </td>
            <td>
              <div class="stacked-cell">
                <span>
                  {{
                    payment.customerId ? customerName(payment.customerId) : 'Unidentified customer'
                  }}
                </span>
                <small class="truncate">{{ payment.description }}</small>
              </div>
            </td>
            <td>{{ payment.date }}</td>
            <td class="number strong">{{ formatMoney(payment.amount) }}</td>
            <td><Badge :label="payment.status" /></td>
            <td>
              <button
                type="button"
                class="text-button subtle"
                @click="
                  emit('action', {
                    kind: ActionKind.Attachments,
                    target: AttachmentTarget.Payment,
                    targetId: payment.id,
                    label: payment.reference,
                  })
                "
              >
                Documents
              </button>
              <button
                v-if="
                  payment.status === PaymentStatus.Unmatched ||
                  payment.status === PaymentStatus.Partial
                "
                class="button small"
                @click="emit('action', { kind: ActionKind.Match, paymentId: payment.id })"
              >
                <Icon
                  v-if="paymentSuggestions.get(payment.id)"
                  name="sparkle"
                  :size="14"
                />
                Review match
              </button>
              <button
                v-else-if="payment.status === PaymentStatus.Matched"
                class="text-button subtle"
                @click="emit('action', { kind: ActionKind.Reverse, paymentId: payment.id })"
              >
                Reverse
              </button>
              <span
                v-else
                class="muted"
              >
                Reversed
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <table v-else-if="page === PageId.Credit">
        <thead>
          <tr>
            <th>Customer</th>
            <th class="number">Credit limit</th>
            <th class="number">Exposure</th>
            <th>Utilization</th>
            <th class="number">Available credit</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="customer in customerRows.slice(offset, offset + PAGE_SIZE)"
            :key="customer.id"
          >
            <td>
              <button
                class="text-button subtle strong"
                @click="emit('action', { kind: ActionKind.Profile, customerId: customer.id })"
              >
                {{ customer.name }}
              </button>
            </td>
            <td class="number">{{ formatMoney(customer.creditLimit) }}</td>
            <td class="number strong">{{ formatMoney(customer.outstanding) }}</td>
            <td>
              <div class="utilization">
                <span :class="{ 'text-red': customer.utilization > 90 }">
                  {{ Math.round(customer.utilization) }}%
                </span>
                <div class="progress-track">
                  <i
                    :class="{ danger: customer.utilization > 90 }"
                    :style="{ width: `${Math.min(customer.utilization, 100)}%` }"
                  ></i>
                </div>
              </div>
            </td>
            <td :class="['number', { 'text-red': customer.available < 0 }]">
              {{ formatMoney(customer.available) }}
            </td>
            <td>
              <button
                class="button small"
                @click="emit('action', { kind: ActionKind.Credit, customerId: customer.id })"
              >
                Review limit
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <table v-else>
        <thead>
          <tr>
            <th>Activity</th>
            <th>Performed by</th>
            <th>Action type</th>
            <th>Date & time</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="event in auditRows.slice(offset, offset + PAGE_SIZE)"
            :key="event.id"
          >
            <td class="audit-detail">
              <Icon
                name="checkCircle"
                :size="20"
              />
              <span>{{ event.detail }}</span>
            </td>
            <td>{{ event.actor }}</td>
            <td>
              <code class="event-code">{{ event.action }}</code>
            </td>
            <td>
              {{
                new Date(event.at).toLocaleString('en-GB', {
                  timeZone: 'Asia/Karachi',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <EmptyState
      v-if="!count && !remoteLoading && !remoteError"
      :title="
        query || filter !== RecordFilter.All
          ? 'No matching results'
          : 'Your next chapter starts here'
      "
      :text="
        query || filter !== RecordFilter.All
          ? 'Try another search or choose a different filter.'
          : 'Add your first record or import a CSV to get started.'
      "
    />
    <footer class="table-footer">
      <span v-if="remote">Page {{ currentPage }} · {{ count }} results</span>
      <span v-else>
        Showing {{ count ? offset + 1 : 0 }}–{{ Math.min(offset + PAGE_SIZE, count) }} of
        {{ count }} results
      </span>
      <div v-if="remote">
        <button class="button small" :disabled="currentPage <= 1 || remoteLoading" @click="previousRemotePage">
          <Icon name="back" :size="15" /> Previous
        </button>
        <span>{{ currentPage }}</span>
        <button class="button small" :disabled="!remotePage || remotePage.nextCursor === null || remoteLoading" @click="nextRemotePage">
          Next <Icon name="arrow" :size="15" />
        </button>
      </div>
      <div v-else>
        <button
          class="button small"
          :disabled="currentPage <= 1"
          @click="currentPage--"
        >
          <Icon
            name="back"
            :size="15"
          />
          Previous
        </button>
        <span>{{ Math.min(currentPage, pages) }} / {{ pages }}</span>
        <button
          class="button small"
          :disabled="currentPage >= pages"
          @click="currentPage++"
        >
          Next
          <Icon
            name="arrow"
            :size="15"
          />
        </button>
      </div>
    </footer>
  </section>
  <div
    v-if="page === PageId.Credit"
    class="info-note"
  >
    <Icon
      name="shield"
      :size="20"
    />
    <p>
      Credit decisions stay with your team. Limit changes require an owner or admin, a reason, and
      an audit entry.
    </p>
  </div>
</template>

<style scoped lang="scss" src="./RecordsPage.scss"></style>
