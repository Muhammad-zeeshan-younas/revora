<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { FINANCE } from '../../shared/constants';
  import { InvoiceStatus, PaymentStatus, PromiseStatus } from '../../shared/enums';
  import { overviewProjectionSchema } from '../../shared/overview-projection';
  import type { OverviewProjection } from '../../shared/overview-projection';
  import {
    aging,
    balance,
    customerAccounts,
    formatMoney,
    metrics,
    operationsMetrics,
    today,
  } from '../../shared/finance';
  import type { Workspace } from '../../shared/schema';
  import Badge from '../components/ui/UiBadge.vue';
  import EmptyState from '../components/ui/EmptyState.vue';
  import Icon from '../components/ui/UiIcon.vue';
  import { request } from '../lib/http-client';
  import { snapshot } from '../stores/workspace';
  import { ActionKind, PageId } from '../config/ui.enums';
  import type { Action, Page } from '../types';

  enum OverviewPeriod {
    SixMonths = '6',
    ThreeMonths = '3',
  }

  const TOP_CUSTOMER_LIMIT = 5;
  const MILLISECONDS_PER_MINUTE = 60_000;
  const MINUTES_PER_HOUR = 60;
  const MINUTES_PER_DAY = FINANCE.millisecondsPerDay / MILLISECONDS_PER_MINUTE;
  const CHART_LAYOUT = {
    width: 580,
    height: 225,
    left: 20,
    right: 560,
    baseline: 185,
    plotHeight: 155,
    gridLeft: 10,
    gridRight: 570,
    gridLines: [30, 107, 185],
    minimumScalePaisa: 100_000_000,
    scaleHeadroom: 1.15,
  } as const;

  const props = defineProps<{ workspace: Workspace }>();
  const emit = defineEmits<{ navigate: [page: Page]; action: [action: Action] }>();
  const period = ref<OverviewPeriod>(OverviewPeriod.SixMonths);
  const hovered = ref<number | null>(null);
  const projection = ref<OverviewProjection | null>(null);
  const projectionError = ref('');
  const numbers = computed(() => projection.value?.numbers ?? metrics(props.workspace));
  const operations = computed(
    () => projection.value?.operations ?? operationsMetrics(props.workspace),
  );
  const customerCount = computed(
    () => projection.value?.customerCount ?? props.workspace.customers.length,
  );
  const openInvoiceCount = computed(
    () =>
      projection.value?.openInvoiceCount ??
      props.workspace.invoices.filter((invoice) => balance(invoice) > 0).length,
  );
  const buckets = computed(() => projection.value?.buckets ?? aging(props.workspace));
  const topCustomers = computed(
    () =>
      projection.value?.topCustomers ??
      customerAccounts(props.workspace)
        .filter((customer) => customer.overdue > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_CUSTOMER_LIMIT),
  );
  const unmatchedCount = computed(
    () =>
      projection.value?.unmatchedCount ??
      props.workspace.payments.filter((payment) =>
        [PaymentStatus.Unmatched, PaymentStatus.Partial].includes(payment.status),
      ).length,
  );
  const pendingPromiseCount = computed(
    () =>
      projection.value?.pendingPromiseCount ??
      props.workspace.promises.filter((promise) => promise.status === PromiseStatus.Pending).length,
  );
  const pendingPromiseAmount = computed(
    () =>
      projection.value?.pendingPromiseAmount ??
      props.workspace.promises
        .filter((promise) => promise.status === PromiseStatus.Pending)
        .reduce((sum, promise) => sum + promise.amount, 0),
  );
  const recentAudit = computed(
    () => projection.value?.recentAudit ?? props.workspace.audit.slice(0, 4),
  );
  const chart = computed(() => {
    if (projection.value) {return projection.value.chart.slice(-Number(period.value));}
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

  async function loadOverview(): Promise<void> {
    projectionError.value = '';
    try {
      projection.value = await request('/workspace/overview', overviewProjectionSchema);
    } catch (cause) {
      projectionError.value = cause instanceof Error ? cause.message : 'Could not load overview.';
    }
  }

  watch(
    () => snapshot.value?.revision,
    () => void loadOverview(),
  );
  onMounted(() => void loadOverview());
  const chartMax = computed(
    () =>
      Math.max(
        CHART_LAYOUT.minimumScalePaisa,
        ...chart.value.map((item) => Math.max(item.collected, item.invoiced)),
      ) * CHART_LAYOUT.scaleHeadroom,
  );
  const chartTotal = computed(() => chart.value.reduce((sum, item) => sum + item.collected, 0));
  const collectedPoints = computed(() =>
    chart.value.map((item, index) => `${x(index)},${y(item.collected)}`).join(' '),
  );
  const invoicedPoints = computed(() =>
    chart.value.map((item, index) => `${x(index)},${y(item.invoiced)}`).join(' '),
  );
  const areaPath = computed(
    () =>
      `M ${CHART_LAYOUT.left},${CHART_LAYOUT.baseline} L ${collectedPoints.value.replaceAll(' ', ' L ')} L ${CHART_LAYOUT.right},${CHART_LAYOUT.baseline} Z`,
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

  function y(value: number): number {
    return CHART_LAYOUT.baseline - (value / chartMax.value) * CHART_LAYOUT.plotHeight;
  }

  function x(index: number): number {
    const plotWidth = CHART_LAYOUT.right - CHART_LAYOUT.left;

    return CHART_LAYOUT.left + (index * plotWidth) / Math.max(1, chart.value.length - 1);
  }

  function relativeTime(date: string): string {
    const minutes = Math.max(
      1,
      Math.round((Date.now() - Date.parse(date)) / MILLISECONDS_PER_MINUTE),
    );

    if (minutes < MINUTES_PER_HOUR) {
      return `${minutes}m ago`;
    }

    if (minutes < MINUTES_PER_DAY) {
      return `${Math.floor(minutes / MINUTES_PER_HOUR)}h ago`;
    }

    return `${Math.floor(minutes / MINUTES_PER_DAY)}d ago`;
  }
</script>
<template>
  <p
    v-if="projectionError"
    role="alert"
    class="error-banner"
  >
    {{ projectionError }}
  </p>
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
        <span>Across {{ customerCount }} customers</span>
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
  <section
    class="operations-strip"
    aria-label="Collection operations"
  >
    <button @click="emit('navigate', PageId.Payments)">
      <span>Receipts to match</span>
      <strong>{{ operations.unallocatedReceipts }}</strong>
      <small>{{ formatMoney(operations.unallocatedAmount) }} still unallocated</small>
    </button>
    <button @click="emit('navigate', PageId.Payments)">
      <span>Waiting 7+ days</span>
      <strong>{{ operations.receiptsWaitingSevenDays }}</strong>
      <small>Receipts with an unallocated balance</small>
    </button>
    <button @click="emit('navigate', PageId.Collections)">
      <span>Promises kept by due date</span>
      <strong>{{ operations.promisesKept }} / {{ operations.promisesDue }}</strong>
      <small>Due promises, excluding cancellations</small>
    </button>
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
        {{ unmatchedCount }} incoming payments are ready for review. Match them to keep your
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
          <option :value="OverviewPeriod.SixMonths">Last 6 months</option>
          <option :value="OverviewPeriod.ThreeMonths">Last 3 months</option>
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
          :viewBox="`0 0 ${CHART_LAYOUT.width} ${CHART_LAYOUT.height}`"
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
            v-for="line in CHART_LAYOUT.gridLines"
            :key="line"
            :x1="CHART_LAYOUT.gridLeft"
            :x2="CHART_LAYOUT.gridRight"
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
          v-for="(event, index) in recentAudit"
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
          v-if="!recentAudit.length"
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
        <small>{{ pendingPromiseCount }} payment promises are on the horizon.</small>
      </span>
    </div>
    <div>
      <strong>
        {{ formatMoney(pendingPromiseAmount, true) }}
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
