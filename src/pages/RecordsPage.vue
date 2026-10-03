<script setup lang="ts">
  import { ImportKind } from '../../shared/enums';

  import { PageId, ActionKind, RecordSort } from '../config/ui.enums';

  import {
    CustomerStatus,
    InteractionOutcome,
    InvoiceStatus,
    PaymentStatus,
  } from '../../shared/enums';

  import { computed, ref, watch } from 'vue';
  import type { Workspace } from '../../shared/schema';
  import { balance, formatMoney, invoiceStatus, suggestMatch } from '../../shared/finance';
  import { useCustomerAccounts } from '../composables/useCustomerAccounts';
  import type { Action } from '../types';
  import Icon from '../components/ui/UiIcon.vue';
  import Badge from '../components/ui/UiBadge.vue';
  import EmptyState from '../components/ui/EmptyState.vue';
  import { download } from '../lib/download';
  import { notify } from '../composables/useNotifications';
  import { csvExport } from '../../shared/csv';

  const props = defineProps<{
    workspace: Workspace;
    page: PageId.Customers | PageId.Invoices | PageId.Payments | PageId.Credit | PageId.Activity;
  }>();
  const emit = defineEmits<{ action: [action: Action] }>();
  const query = ref('');
  const filter = ref('All');
  const sort = ref(RecordSort.Name);
  const currentPage = ref(1);
  const { accounts, customerName } = useCustomerAccounts(() => props.workspace);
  const searchTerm = computed(() => query.value.trim().toLowerCase());
  const matches = (text: string): boolean => text.toLowerCase().includes(searchTerm.value);
  watch([query, sort, filter], () => {
    currentPage.value = 1;
  });
  watch(
    () => props.page,
    () => {
      filter.value = 'All';
      query.value = '';
      currentPage.value = 1;
    },
  );
  const customerRows = computed(() =>
    accounts.value
      .filter(
        (customer) =>
          matches(`${customer.name} ${customer.city} ${customer.contact}`) &&
          (filter.value === 'All' ||
            (filter.value === InvoiceStatus.Overdue
              ? customer.overdue > 0
              : filter.value === 'Over limit'
                ? customer.available < 0
                : customer.status === filter.value)),
      )
      .sort((a, b) =>
        sort.value === RecordSort.Balance
          ? b.outstanding - a.outstanding
          : a.name.localeCompare(b.name),
      ),
  );
  const invoiceRows = computed(() =>
    props.workspace.invoices
      .filter(
        (invoice) =>
          matches(`${invoice.number} ${customerName(invoice.customerId)}`) &&
          (filter.value === 'All' || invoiceStatus(invoice) === filter.value),
      )
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
  );
  const paymentRows = computed(() =>
    props.workspace.payments
      .filter(
        (payment) =>
          matches(
            `${payment.reference} ${payment.description} ${customerName(payment.customerId)}`,
          ) &&
          (filter.value === 'All' || payment.status === filter.value),
      )
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
  const auditRows = computed(() =>
    props.workspace.audit.filter(
      (event) =>
        matches(`${event.detail} ${event.actor}`) &&
        (filter.value === 'All' || event.action.startsWith(filter.value)),
    ),
  );
  const count = computed(() =>
    props.page === PageId.Invoices
      ? invoiceRows.value.length
      : props.page === PageId.Payments
        ? paymentRows.value.length
        : props.page === PageId.Activity
          ? auditRows.value.length
          : customerRows.value.length,
  );
  const pages = computed(() => Math.max(1, Math.ceil(count.value / 10)));
  const offset = computed(() => (Math.min(currentPage.value, pages.value) - 1) * 10);
  const tabs = computed(() =>
    props.page === PageId.Invoices
      ? [
          'All',
          InvoiceStatus.Open,
          InvoiceStatus.Overdue,
          InvoiceStatus.Paid,
          InvoiceStatus.Disputed,
        ]
      : props.page === PageId.Payments
        ? [
            'All',
            PaymentStatus.Unmatched,
            PaymentStatus.Partial,
            PaymentStatus.Matched,
            PaymentStatus.Reversed,
          ]
        : props.page === PageId.Credit
          ? ['All', 'Over limit', InvoiceStatus.Overdue]
          : props.page === PageId.Activity
            ? ['All', 'payment', 'invoice', 'promise', 'reminder', 'credit', 'member']
            : ['All', CustomerStatus.Active, InvoiceStatus.Overdue, CustomerStatus.OnHold],
  );
  const tabCounts = computed(() => {
    const counts = new Map(tabs.value.map((tab) => [tab, 0]));
    const increment = (tab: string): void => {
      counts.set(tab, (counts.get(tab) ?? 0) + 1);
    };

    if (props.page === PageId.Invoices) {
      for (const invoice of props.workspace.invoices) {
        increment('All');
        increment(invoiceStatus(invoice));
      }
    } else if (props.page === PageId.Payments) {
      for (const payment of props.workspace.payments) {
        increment('All');
        increment(payment.status);
      }
    } else if (props.page === PageId.Activity) {
      for (const event of props.workspace.audit) {
        for (const tab of tabs.value) {
          if (tab === 'All' || event.action.startsWith(tab)) {
            increment(tab);
          }
        }
      }
    } else {
      for (const customer of accounts.value) {
        increment('All');
        increment(customer.status);
        if (customer.overdue > 0) {
          increment(InvoiceStatus.Overdue);
        }
        if (customer.available < 0) {
          increment('Over limit');
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
          .slice(offset.value, offset.value + 10)
          .map((payment) => [payment.id, suggestMatch(props.workspace, payment)]),
      ),
  );

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
    notify('Filtered report exported.');
  }
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
            tab === 'All'
              ? `All ${page === PageId.Credit ? 'accounts' : page === PageId.Activity ? 'activity' : page}`
              : tab
          }}
          <span>{{ tabCounts.get(tab) ?? 0 }}</span>
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
        <select
          v-if="page === PageId.Customers || page === PageId.Credit"
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
          Export
        </button>
      </div>
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
            v-for="(customer, index) in customerRows.slice(offset, offset + 10)"
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
            v-for="invoice in invoiceRows.slice(offset, offset + 10)"
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
                v-if="balance(invoice) > 0"
                class="text-button"
                @click="emit('action', { kind: ActionKind.Dispute, invoiceId: invoice.id })"
              >
                {{
                  invoice.status === InvoiceStatus.Disputed ? 'Resolve' : InteractionOutcome.Dispute
                }}
              </button>
              <span
                v-else
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
            v-for="payment in paymentRows.slice(offset, offset + 10)"
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
            v-for="customer in customerRows.slice(offset, offset + 10)"
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
            v-for="event in auditRows.slice(offset, offset + 10)"
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
      v-if="!count"
      :title="query || filter !== 'All' ? 'No matching results' : 'Your next chapter starts here'"
      :text="
        query || filter !== 'All'
          ? 'Try another search or choose a different filter.'
          : 'Add your first record or import a CSV to get started.'
      "
    />
    <footer class="table-footer">
      <span>
        Showing {{ count ? offset + 1 : 0 }}–{{ Math.min(offset + 10, count) }} of
        {{ count }} results
      </span>
      <div>
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
