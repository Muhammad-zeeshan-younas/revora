<script setup lang="ts">
  import { PageId, ActionKind } from '../config/ui.enums';

  import { InvoiceStatus, PaymentStatus, PromiseStatus } from '../../shared/enums';

  import { computed, ref } from 'vue';
  import type { Workspace } from '../../shared/schema';
  import { aging, balance, formatMoney, metrics, today } from '../../shared/finance';
  import { useCustomerAccounts } from '../composables/useCustomerAccounts';
  import type { Action, Page } from '../types';
  import Icon from '../components/ui/UiIcon.vue';
  import Badge from '../components/ui/UiBadge.vue';
  import EmptyState from '../components/ui/EmptyState.vue';

  const props = defineProps<{ workspace: Workspace }>();
  const emit = defineEmits<{ navigate: [page: Page]; action: [action: Action] }>();
  const period = ref('6');
  const hovered = ref<number | null>(null);
  const numbers = computed(() => metrics(props.workspace));
  const { accounts } = useCustomerAccounts(() => props.workspace);
  const openInvoiceCount = computed(
    () => props.workspace.invoices.filter((invoice) => balance(invoice) > 0).length,
  );
  const buckets = computed(() => aging(props.workspace));
  const topCustomers = computed(() =>
    accounts.value
      .filter((customer) => customer.overdue > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5),
  );
  const unmatched = computed(() =>
    props.workspace.payments.filter((payment) =>
      [PaymentStatus.Unmatched, PaymentStatus.Partial].includes(payment.status),
    ),
  );
  const pendingPromises = computed(() =>
    props.workspace.promises.filter((promise) => promise.status === PromiseStatus.Pending),
  );
  const chart = computed(() => {
    const result: { label: string; collected: number; invoiced: number }[] = [];
    for (let index = Number(period.value) - 1; index >= 0; index--) {
      const date = new Date(`${today().slice(0, 7)}-01T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() - index);
      const key = date.toISOString().slice(0, 7);
      result.push({
        label: date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
        collected: props.workspace.payments
          .filter(
            (payment) => payment.date.startsWith(key) && payment.status !== PaymentStatus.Reversed,
          )
          .reduce(
            (sum, payment) =>
              sum + payment.allocations.reduce((value, allocation) => value + allocation.amount, 0),
            0,
          ),
        invoiced: props.workspace.invoices
          .filter(
            (invoice) =>
              invoice.issuedAt.startsWith(key) &&
              invoice.status !== InvoiceStatus.Draft &&
              invoice.status !== InvoiceStatus.WrittenOff,
          )
          .reduce((sum, invoice) => sum + invoice.amount, 0),
      });
    }

    return result;
  });
  const chartMax = computed(
    () =>
      Math.max(100000000, ...chart.value.map((item) => Math.max(item.collected, item.invoiced))) *
      1.15,
  );
  const chartTotal = computed(() => chart.value.reduce((sum, item) => sum + item.collected, 0));
  const y = (value: number): number => 185 - (value / chartMax.value) * 155;
  const x = (index: number): number => 20 + (index * 540) / Math.max(1, chart.value.length - 1);
  const collectedPoints = computed(() =>
    chart.value.map((item, index) => `${x(index)},${y(item.collected)}`).join(' '),
  );
  const invoicedPoints = computed(() =>
    chart.value.map((item, index) => `${x(index)},${y(item.invoiced)}`).join(' '),
  );
  const areaPath = computed(
    () => `M 20,185 L ${collectedPoints.value.replaceAll(' ', ' L ')} L 560,185 Z`,
  );
  const donut = computed(() => {
    let cumulative = 0;

    return buckets.value
      .map((bucket) => {
        const start = cumulative;
        cumulative += numbers.value.total ? (bucket.amount / numbers.value.total) * 100 : 0;

        return `${bucket.color} ${start}% ${cumulative}%`;
      })
      .join(',');
  });

  function relativeTime(date: string): string {
    const minutes = Math.max(1, Math.round((Date.now() - Date.parse(date)) / 60000));

    return minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
  }
</script>
<template>
  <div class="overview-toolbar">
    <div class="segmented">
      <button class="selected">Business overview</button>
      <button @click="emit('navigate', PageId.Activity)">Recent activity</button>
    </div>
    <span class="live-caption">
      <span class="status-dot"></span>
      Live workspace
      <span class="toolbar-dot">·</span>
      <Icon
        name="calendar"
        :size="15"
      />
      {{
        new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      }}
    </span>
  </div>
  <section
    class="stat-grid"
    aria-label="Receivables summary"
  >
    <article class="stat-card featured">
      <div class="stat-label">
        Total receivables
        <span class="stat-icon">
          <Icon
            name="wallet"
            :size="19"
          />
        </span>
      </div>
      <div class="stat-number">
        {{ formatMoney(numbers.total, true) }}
        <span>PKR</span>
      </div>
      <div class="stat-footer">
        <span class="light-tag">
          {{ openInvoiceCount }}
          open invoices
        </span>
        <span>Across {{ workspace.customers.length }} customers</span>
      </div>
      <div class="card-watermark"></div>
    </article>
    <article class="stat-card">
      <div class="stat-label">
        Overdue amount
        <span class="stat-icon amber-icon">
          <Icon
            name="clock"
            :size="19"
          />
        </span>
      </div>
      <div class="stat-number">{{ formatMoney(numbers.overdue, true) }}</div>
      <div class="stat-footer">
        <span class="metric-tag amber">
          <Icon
            name="warning"
            :size="13"
          />
          {{ numbers.total ? Math.round((numbers.overdue / numbers.total) * 100) : 0 }}% of
          receivables
        </span>
        <span>Needs follow-up</span>
      </div>
    </article>
    <article class="stat-card">
      <div class="stat-label">
        Collected this month
        <span class="stat-icon green-icon">
          <Icon
            name="payments"
            :size="19"
          />
        </span>
      </div>
      <div class="stat-number">{{ formatMoney(numbers.collected, true) }}</div>
      <div class="stat-footer">
        <span class="metric-tag green">
          <Icon
            name="check"
            :size="13"
          />
          Reconciled
        </span>
        <span>{{ new Date().toLocaleDateString('en-GB', { month: 'long' }) }} to date</span>
      </div>
    </article>
    <article class="stat-card">
      <div class="stat-label">
        Average outstanding age
        <span class="stat-icon">
          <Icon
            name="chart"
            :size="19"
          />
        </span>
      </div>
      <div class="stat-number">
        {{ numbers.averageDays }}
        <span class="days-unit">days</span>
      </div>
      <div class="stat-footer">
        <span class="metric-tag neutral">Balance weighted</span>
        <span>From invoice date</span>
      </div>
    </article>
  </section>
  <section class="insight-strip">
    <span class="insight-icon">
      <Icon
        name="sparkle"
        :size="22"
        weight="fill"
      />
    </span>
    <div>
      <strong>A little attention can go a long way.</strong>
      <p>
        {{ unmatched.length }} incoming payments are ready for review. Match them to keep your
        balances up to date.
      </p>
    </div>
    <button
      class="text-button"
      @click="emit('navigate', PageId.Payments)"
    >
      Review payments
      <Icon
        name="arrow"
        :size="18"
      />
    </button>
  </section>
  <div class="dashboard-charts">
    <section class="panel cashflow-panel">
      <header class="panel-header">
        <div>
          <h2>Cash coming in</h2>
          <p>A closer look at your collection momentum.</p>
        </div>
        <select
          v-model="period"
          aria-label="Chart period"
          class="compact-select"
        >
          <option value="6">Last 6 months</option>
          <option value="3">Last 3 months</option>
        </select>
      </header>
      <div class="chart-summary">
        <strong>{{ formatMoney(chartTotal, true) }}</strong>
        <span>collected in this period</span>
        <div class="chart-legend">
          <span>
            <i class="legend-dot dark"></i>
            Collected
          </span>
          <span>
            <i class="legend-dot pale"></i>
            Invoiced
          </span>
        </div>
      </div>
      <div class="line-chart">
        <div class="chart-y-labels">
          <span
            v-for="fraction in [1, 0.5, 0]"
            :key="fraction"
          >
            {{ formatMoney(chartMax * fraction, true) }}
          </span>
        </div>
        <svg
          viewBox="0 0 580 225"
          role="img"
          :aria-label="`Collections and invoiced amounts over the last ${period} months`"
        >
          <defs>
            <linearGradient
              id="area-gradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stop-color="#315ee7"
                stop-opacity=".2"
              />
              <stop
                offset="100%"
                stop-color="#315ee7"
                stop-opacity=".01"
              />
            </linearGradient>
          </defs>
          <line
            v-for="line in [30, 107, 185]"
            :key="line"
            x1="10"
            x2="570"
            :y1="line"
            :y2="line"
            stroke="#dce3ee"
            stroke-dasharray="4 5"
          />
          <path
            :d="areaPath"
            fill="url(#area-gradient)"
          />
          <polyline
            :points="invoicedPoints"
            fill="none"
            stroke="#a8c4ff"
            stroke-width="2.5"
            stroke-dasharray="6 5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <polyline
            :points="collectedPoints"
            fill="none"
            stroke="#315ee7"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <g
            v-for="(item, index) in chart"
            :key="item.label"
            @mouseenter="hovered = index"
            @mouseleave="hovered = null"
          >
            <rect
              :x="x(index) - 25"
              y="10"
              width="50"
              height="180"
              fill="transparent"
            />
            <circle
              :cx="x(index)"
              :cy="y(item.collected)"
              :r="hovered === index ? 5 : 3.5"
              fill="#fff"
              stroke="#315ee7"
              stroke-width="2"
            />
            <text
              :x="x(index)"
              y="216"
              text-anchor="middle"
              fill="#52637a"
              font-size="12"
            >
              {{ item.label }}
            </text>
            <title>
              {{ item.label }}: {{ formatMoney(item.collected) }} collected;
              {{ formatMoney(item.invoiced) }} invoiced
            </title>
          </g>
        </svg>
      </div>
      <div class="chart-caption">
        <span>
          <Icon
            name="trend"
            :size="16"
          />
          Every settled invoice is a step forward.
        </span>
        <button
          class="text-button"
          @click="emit('navigate', PageId.Payments)"
        >
          View payments
          <Icon
            name="upRight"
            :size="14"
          />
        </button>
      </div>
    </section>
    <section class="panel aging-panel">
      <header class="panel-header">
        <div>
          <h2>Receivables aging</h2>
          <p>The full picture of what’s outstanding.</p>
        </div>
        <Icon
          name="invoice"
          :size="19"
        />
      </header>
      <div class="aging-content">
        <div class="donut-wrap">
          <div
            class="donut"
            :style="{ background: numbers.total ? `conic-gradient(${donut})` : '#f7f9fc' }"
          >
            <div class="donut-center">
              <span>Outstanding</span>
              <strong>{{ formatMoney(numbers.total, true) }}</strong>
              <small>across all invoices</small>
            </div>
          </div>
        </div>
        <div class="aging-legend">
          <div
            v-for="bucket in buckets"
            :key="bucket.label"
          >
            <span>
              <i :style="{ background: bucket.color }"></i>
              {{ bucket.label }}
            </span>
            <strong>{{ formatMoney(bucket.amount, true) }}</strong>
            <small>
              {{ numbers.total ? Math.round((bucket.amount / numbers.total) * 100) : 0 }}%
            </small>
          </div>
        </div>
      </div>
      <button
        class="panel-bottom-link"
        @click="emit('navigate', PageId.Invoices)"
      >
        Explore all receivables
        <Icon
          name="arrow"
          :size="16"
        />
      </button>
    </section>
  </div>
  <div class="dashboard-bottom">
    <section class="panel priority-panel">
      <header class="panel-header">
        <div class="title-with-count">
          <h2>A little follow-up needed</h2>
          <span class="count-pill">{{ topCustomers.length }}</span>
          <p>Your priority accounts, ready for action.</p>
        </div>
        <button
          class="text-button"
          @click="emit('navigate', PageId.Collections)"
        >
          View collections
          <Icon
            name="arrow"
            :size="16"
          />
        </button>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th class="number">Overdue amount</th>
              <th>Overdue by</th>
              <th>Priority</th>
              <th><span class="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(customer, index) in topCustomers"
              :key="customer.id"
            >
              <td>
                <button
                  class="customer-cell"
                  @click="emit('action', { kind: ActionKind.Profile, customerId: customer.id })"
                >
                  <span :class="['avatar', `avatar-${index % 5}`]">
                    {{
                      customer.name
                        .split(' ')
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join('')
                    }}
                  </span>
                  <span>
                    <strong>{{ customer.name }}</strong>
                    <small>{{ customer.city }}</small>
                  </span>
                </button>
              </td>
              <td class="number strong">{{ formatMoney(customer.overdue) }}</td>
              <td>
                <span class="overdue-days">{{ customer.days }} days</span>
              </td>
              <td><Badge :label="customer.priority" /></td>
              <td>
                <button
                  class="row-action"
                  :aria-label="`Follow up with ${customer.name}`"
                  @click="emit('action', { kind: ActionKind.Interaction, customerId: customer.id })"
                >
                  <Icon
                    name="arrow"
                    :size="17"
                  />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState
        v-if="!topCustomers.length"
        title="All caught up"
        text="No overdue accounts need your attention."
      />
    </section>
    <section class="panel activity-panel">
      <header class="panel-header">
        <div>
          <h2>Making things happen</h2>
          <p>The latest in your workspace.</p>
        </div>
        <span class="live-dot"></span>
      </header>
      <div class="activity-list">
        <div
          v-for="(event, index) in workspace.audit.slice(0, 4)"
          :key="event.id"
          class="activity-item"
        >
          <span :class="['activity-icon', index % 2 === 0 ? 'green-icon' : 'amber-icon']">
            <Icon
              :name="
                event.action.startsWith('payment')
                  ? 'payments'
                  : event.action.startsWith('promise')
                    ? 'chat'
                    : event.action.startsWith('credit')
                      ? 'shield'
                      : 'checkCircle'
              "
              :size="17"
            />
          </span>
          <div>
            <p>{{ event.detail }}</p>
            <span>
              {{ event.actor }}
              <i>·</i>
              {{ relativeTime(event.at) }}
            </span>
          </div>
        </div>
        <EmptyState
          v-if="!workspace.audit.length"
          title="A fresh start"
          text="Your first action will appear here."
        />
      </div>
      <button
        class="panel-bottom-link"
        @click="emit('navigate', PageId.Activity)"
      >
        View all activity
        <Icon
          name="arrow"
          :size="16"
        />
      </button>
    </section>
  </div>
  <section class="promise-strip">
    <div>
      <span class="promise-strip-icon">
        <Icon
          name="target"
          :size="23"
        />
      </span>
      <span>
        <strong>Good on their word.</strong>
        <small>{{ pendingPromises.length }} payment promises are on the horizon.</small>
      </span>
    </div>
    <div>
      <strong>
        {{
          formatMoney(
            pendingPromises.reduce((sum, promise) => sum + promise.amount, 0),
            true,
          )
        }}
      </strong>
      <span>expected from active promises</span>
    </div>
    <button
      class="text-button"
      @click="emit('navigate', PageId.Collections)"
    >
      Track promises
      <Icon
        name="arrow"
        :size="17"
      />
    </button>
  </section>
</template>

<style scoped lang="scss" src="./OverviewPage.scss"></style>
