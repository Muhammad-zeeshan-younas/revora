<script setup lang="ts">
  import { PageId, ActionKind } from '../config/ui.enums';

  import { InvoiceStatus, PaymentStatus, PromiseStatus } from '../../shared/enums';

  import { computed, ref } from 'vue';
  import type { Workspace } from '../../shared/schema';
  import { account, aging, formatMoney, metrics, today } from '../../shared/finance';
  import type { Action, Page } from '../types';
  import Icon from '../components/ui/UiIcon.vue';
  import Badge from '../components/ui/UiBadge.vue';
  import EmptyState from '../components/ui/EmptyState.vue';

  const props = defineProps<{ workspace: Workspace }>();
  const emit = defineEmits<{ navigate: [page: Page]; action: [action: Action] }>();
  const period = ref('6');
  const hovered = ref<number | null>(null);
  const numbers = computed(() => metrics(props.workspace));
  const buckets = computed(() => aging(props.workspace));
  const topCustomers = computed(() =>
    props.workspace.customers
      .map((customer) => ({ ...customer, ...account(props.workspace, customer.id) }))
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
          {{
            workspace.invoices.filter(
              (invoice) => invoice.amount > invoice.paid && invoice.status !== InvoiceStatus.Draft,
            ).length
          }}
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

<style scoped lang="scss">
  @use '../styles/tokens' as *;

  .overview-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .segmented {
    display: inline-flex;
    gap: 3px;
    border: 1px solid $surface-muted;
    padding: 3px;
    border-radius: 7px;
    background: $surface-soft;
    button {
      background: none;
      border: 1px solid transparent;
      border-radius: 5px;
      font-size: 12px;
      padding: 7px 13px;
      color: $muted;
      &.selected {
        background: white;
        color: $ink;
        border-color: $surface-muted;
        box-shadow: 0 1px 3px #172b4d10;
      }
    }
  }

  .live-caption {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: $muted;
    .status-dot {
      width: 4px;
      height: 4px;
    }
  }

  .toolbar-dot {
    margin: 0 5px;
    color: $muted;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 20px;
    margin-bottom: 24px;
  }

  .stat-card {
    min-height: 166px;
    border: 1px solid $border;
    border-radius: 14px;
    background: #fff;
    padding: 22px;
    position: relative;
    overflow: hidden;
    box-shadow: 0 2px 3px #172b4d02;
    &.featured {
      background: linear-gradient(120deg, $navy, #254575);
      border-color: $navy;
      color: $on-dark;
      .stat-label {
        color: $on-dark;
        font-size: 12px;
      }
      .stat-icon {
        background: #ffffff14;
        color: $accent-light;
      }
      .stat-footer {
        color: #c0cfe6;
        gap: 8px;
        flex-wrap: wrap;
        line-height: 1.6;
      }
      .stat-number > span {
        color: #c0cfe6;
      }
    }
  }

  .stat-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: $muted;
    position: relative;
    z-index: 1;
  }

  .stat-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    width: 28px;
    border-radius: 7px;
    background: $surface-soft;
    color: $muted;
  }

  .stat-number {
    font-family: $font-heading;
    font-size: 27px;
    letter-spacing: -0.8px;
    line-height: 1.2;
    font-weight: 570;
    margin-top: 11px;
    font-variant-numeric: tabular-nums;
    position: relative;
    z-index: 1;
    > span {
      font-size: 12px;
      letter-spacing: 0.2px;
      font-weight: 400;
      margin-left: 8px;
      color: $muted;
    }
    > span.days-unit {
      font-size: 12px;
      color: $muted;
      margin-left: 5px;
    }
  }

  .stat-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 18px;
    font-size: 12px;
    color: $muted;
    white-space: nowrap;
    position: relative;
    z-index: 1;
    flex-wrap: wrap;
    line-height: 1.6;
  }

  .light-tag {
    padding: 3px 5px;
    border-radius: 4px;
    background: #ffffff14;
    color: $on-dark;
    font-size: 12px;
  }

  .metric-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 5px;
    border-radius: 4px;
    &.green {
      background: $success-soft;
      color: $success;
    }
    &.amber {
      background: $surface-soft;
      color: #bda268;
    }
    &.neutral {
      background: $surface-soft;
      color: $muted;
    }
  }

  .card-watermark {
    position: absolute;
    width: 160px;
    height: 160px;
    border: 1px solid $accent;
    border-radius: 50%;
    right: -95px;
    bottom: -92px;
    &::before,
    &::after {
      content: '';
      position: absolute;
      border: 1px solid $accent;
      border-radius: 50%;
      inset: -17px;
    }
    &::after {
      inset: -34px;
    }
  }

  .dashboard-charts {
    display: grid;
    grid-template-columns: minmax(0, 1.33fr) minmax(0, 1fr);
    gap: 21px;
    margin-bottom: 23px;
  }

  .chart-summary {
    display: flex;
    align-items: center;
    padding: 23px 22px 8px;
    gap: 8px;
    > strong {
      font-size: 24px;
      font-weight: 550;
      letter-spacing: -0.6px;
    }
    > span {
      font-size: 12px;
      color: $muted;
    }
  }

  .chart-legend {
    margin-left: auto;
    display: flex;
    gap: 13px;
    align-items: center;
    font-size: 12px;
    color: $muted;
    > span {
      display: flex;
      gap: 5px;
      align-items: center;
    }
  }

  .legend-dot {
    width: 5px;
    height: 5px;
    display: inline-block;
    border-radius: 50%;
    &.dark {
      background: $accent;
    }
    &.pale {
      background: $accent-light;
    }
  }

  .line-chart {
    padding: 10px 22px 0 16px;
    display: flex;
    align-items: stretch;
    height: 202px;
    svg {
      width: calc(100% - 64px);
      height: 100%;
      overflow: visible;
    }
  }

  .chart-y-labels {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 22px 0 33px;
    width: 64px;
    flex-shrink: 0;
    white-space: nowrap;
    font-size: 12px;
    color: $muted;
  }

  .chart-caption {
    border-top: 1px solid $surface-soft;
    margin: 9px 22px 0;
    padding: 12px 0 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    > span {
      display: flex;
      gap: 6px;
      align-items: center;
      color: $muted;
      font-size: 12px;
    }
    .text-button {
      font-size: 12px;
      color: $muted;
    }
  }

  .aging-content {
    display: flex;
    align-items: center;
    gap: 21px;
    padding: 32px 22px 24px;
    min-height: 258px;
  }

  .donut-wrap {
    width: 174px;
    flex-shrink: 0;
  }

  .donut {
    width: 174px;
    height: 174px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: rotate(-90deg);
  }

  .donut-center {
    width: 133px;
    height: 133px;
    background: white;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transform: rotate(90deg);
    span {
      font-size: 12px;
      color: $muted;
    }
    strong {
      font-size: 22px;
      letter-spacing: -0.6px;
      font-weight: 600;
      margin: 7px 0 6px;
    }
    small {
      font-size: 12px;
      color: $muted;
    }
  }

  .aging-legend {
    flex: 1;
    min-width: 0;
    > div {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      margin: 14px 0;
      > span {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        white-space: nowrap;
        color: $muted;
      }
      strong {
        font-size: 12px;
        font-weight: 550;
        white-space: nowrap;
      }
      small {
        color: $muted;
        width: 24px;
        text-align: right;
        font-size: 12px;
      }
      i {
        width: 6px;
        height: 6px;
        border-radius: 2px;
      }
    }
  }

  .dashboard-bottom {
    display: grid;
    grid-template-columns: minmax(0, 1.75fr) minmax(0, 1fr);
    gap: 21px;
    margin-bottom: 22px;
  }

  .title-with-count {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    p {
      flex-basis: 100%;
      margin-top: 0;
    }
  }

  .count-pill {
    font-size: 12px;
    padding: 2px 5px;
    border-radius: 4px;
    background: $surface-soft;
    color: $muted;
  }

  .priority-panel .panel-header {
    padding-bottom: 22px;
  }

  .overdue-days {
    font-size: 12px;
    color: $muted;
  }

  .row-action {
    background: transparent;
    border: 1px solid $surface-muted;
    border-radius: 5px;
    color: $muted;
    width: 26px;
    height: 26px;
    display: flex;
    justify-content: center;
    align-items: center;
    &:hover {
      background: $surface-soft;
    }
  }

  .priority-panel {
    th {
      padding: 11px 15px;
    }
    td {
      padding: 13px 15px;
      font-size: 12px;
    }
    th:first-child,
    td:first-child {
      padding-left: 22px;
    }
  }

  .live-dot {
    width: 6px;
    height: 6px;
    background: $accent-light;
    border-radius: 50%;
    box-shadow: 0 0 0 4px $surface-soft;
    margin-top: 4px;
  }

  .activity-list {
    padding: 22px 20px 3px;
  }

  .activity-item {
    display: flex;
    gap: 12px;
    position: relative;
    padding-bottom: 21px;
    &:not(:last-child)::after {
      content: '';
      position: absolute;
      top: 31px;
      left: 14px;
      bottom: 2px;
      border-left: 1px dashed $surface-muted;
    }
    p {
      color: $muted;
      font-size: 12px;
      line-height: 1.6;
    }
    > div > span {
      color: $muted;
      font-size: 12px;
      display: block;
      margin-top: 5px;
      i {
        margin: 0 5px;
        font-style: normal;
      }
    }
  }

  .activity-icon {
    width: 29px;
    height: 29px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .promise-strip {
    border: 1px solid $surface-muted;
    border-radius: 8px;
    background: $surface-soft;
    display: flex;
    align-items: center;
    padding: 18px 21px;
    gap: 28px;
    > div:first-child {
      display: flex;
      gap: 12px;
      align-items: center;
      flex: 1;
      strong {
        font-size: 12px;
        color: $muted;
      }
      small {
        display: block;
        font-size: 12px;
        color: $muted;
        margin-top: 4px;
      }
    }
    > div:nth-child(2) {
      border-right: 1px solid $surface-muted;
      padding-right: 28px;
      strong {
        font-size: 19px;
        letter-spacing: -0.4px;
        font-weight: 550;
        color: $muted;
        display: block;
      }
      span {
        display: block;
        color: $muted;
        font-size: 12px;
        margin-top: 4px;
      }
    }
    .text-button {
      font-size: 12px;
      color: $muted;
    }
  }

  .promise-strip-icon {
    width: 37px;
    height: 37px;
    border-radius: 9px;
    border: 1px solid $surface-muted;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $muted;
    background: $surface-muted;
  }

  .stat-card,
  .dashboard-charts,
  .dashboard-bottom {
    animation: content-in 0.35s ease both;
  }

  .stat-card:nth-child(2) {
    animation-delay: 0.035s;
  }

  .stat-card:nth-child(3) {
    animation-delay: 0.07s;
  }

  .stat-card:nth-child(4) {
    animation-delay: 0.1s;
  }

  @media (min-width: 1500px) {
    .stat-card {
      min-height: 160px;
      padding: 20px 23px;
    }
    .stat-label {
      font-size: 12px;
    }
    .stat-number {
      font-size: 32px;
    }
    .stat-footer {
      font-size: 12px;
    }
    .aging-content {
      gap: 30px;
    }
    .donut-wrap,
    .donut {
      width: 190px;
      height: 190px;
    }
    .donut-center {
      width: 148px;
      height: 148px;
    }
    .aging-legend > div {
      font-size: 12px;
      strong {
        font-size: 12px;
      }
    }
    .line-chart {
      height: 220px;
    }
    .priority-panel td {
      padding-top: 16px;
      padding-bottom: 16px;
    }
    .activity-item {
      padding-bottom: 25px;
      p {
        font-size: 12px;
      }
    }
  }

  @media (max-width: 1200px) {
    .stat-grid {
      gap: 11px;
    }
    .stat-card {
      padding: 15px 13px;
    }
    .stat-number {
      font-size: 24px;
    }
    .stat-footer {
      flex-wrap: wrap;
      font-size: 12px;
      margin-top: 13px;
      gap: 5px;
    }
    .dashboard-charts {
      grid-template-columns: 1.2fr 1fr;
      gap: 16px;
    }
    .aging-content {
      gap: 15px;
      padding: 29px 17px 20px;
    }
    .donut-wrap,
    .donut {
      width: 143px;
      height: 143px;
    }
    .donut-center {
      width: 110px;
      height: 110px;
      strong {
        font-size: 18px;
      }
      small {
        font-size: 12px;
      }
    }
    .aging-legend > div {
      gap: 5px;
      small {
        display: none;
      }
    }
    .chart-summary {
      flex-wrap: wrap;
      > strong {
        font-size: 21px;
      }
      > span {
        font-size: 12px;
      }
    }
    .chart-legend {
      gap: 9px;
    }
    .chart-caption > span {
      max-width: 60%;
      font-size: 12px;
    }
    .dashboard-bottom {
      grid-template-columns: 1.6fr 1fr;
      gap: 16px;
    }
    .priority-panel td,
    .priority-panel th {
      padding-left: 10px;
      padding-right: 10px;
    }
    .priority-panel .avatar {
      width: 28px;
      height: 28px;
      font-size: 12px;
    }
    .priority-panel .customer-cell strong {
      font-size: 12px;
    }
    .priority-panel .badge {
      font-size: 12px;
    }
    .activity-list {
      padding-left: 16px;
      padding-right: 16px;
    }
    .activity-item {
      gap: 9px;
    }
  }

  @media (max-width: 1000px) {
    .dashboard-charts {
      grid-template-columns: 1fr;
    }
    .dashboard-bottom {
      grid-template-columns: 1fr;
    }
    .aging-content {
      justify-content: center;
      min-height: 230px;
      padding: 20px 40px;
      gap: 45px;
    }
    .aging-legend {
      max-width: 280px;
      > div {
        font-size: 12px;
        strong {
          font-size: 12px;
        }
        small {
          display: block;
        }
      }
    }
    .donut-wrap,
    .donut {
      width: 175px;
      height: 175px;
    }
    .donut-center {
      width: 135px;
      height: 135px;
      strong {
        font-size: 22px;
      }
    }
    .stat-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .stat-number {
      font-size: 29px;
    }
    .stat-label {
      font-size: 12px;
    }
    .stat-footer {
      flex-wrap: nowrap;
    }
    .stat-card {
      min-height: 140px;
    }
    .activity-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .activity-item::after {
      display: none;
    }
    .promise-strip {
      gap: 18px;
      padding: 17px;
      > div:nth-child(2) {
        padding-right: 18px;
      }
    }
    .live-caption {
      font-size: 12px;
    }
  }

  @media (max-width: 760px) {
    .overview-toolbar {
      align-items: flex-start;
      gap: 10px;
    }
    .live-caption {
      display: none;
    }
    .stat-grid {
      gap: 12px;
      margin-bottom: 17px;
    }
    .stat-card {
      padding: 15px;
    }
    .stat-number {
      font-size: 25px;
    }
    .stat-label {
      font-size: 12px;
    }
    .stat-footer {
      flex-wrap: wrap;
      gap: 5px;
      > span:last-child {
        font-size: 12px;
      }
    }
    .stat-icon {
      width: 24px;
      height: 24px;
      svg {
        width: 16px;
        height: 16px;
      }
    }
    .cashflow-panel {
      .chart-summary {
        padding: 20px 18px 5px;
      }
    }
    .chart-summary > span {
      display: none;
    }
    .line-chart {
      height: 195px;
      padding-left: 12px;
      padding-right: 20px;
    }
    .chart-y-labels {
      font-size: 12px;
    }
    .aging-content {
      padding: 25px 23px;
      gap: 30px;
    }
    .aging-legend > div {
      font-size: 12px;
      strong {
        font-size: 12px;
      }
    }
    .dashboard-bottom,
    .dashboard-charts {
      gap: 18px;
      margin-bottom: 18px;
    }
    .priority-panel .panel-header {
      padding-bottom: 19px;
    }
    .priority-panel table {
      min-width: 510px;
    }
    .priority-panel .customer-cell strong {
      font-size: 12px;
    }
    .activity-list {
      display: block;
      padding-top: 22px;
    }
    .activity-item {
      padding-bottom: 22px;
      p {
        font-size: 12px;
      }
    }
    .promise-strip {
      flex-wrap: wrap;
      > div:first-child {
        flex-basis: 100%;
      }
      > div:nth-child(2) {
        border: 0;
        flex: 1;
        margin-left: 49px;
      }
    }
  }

  @media (max-width: 390px) {
    .stat-card {
      padding: 12px;
    }
    .stat-number {
      font-size: 23px;
    }
    .stat-label {
      font-size: 12px;
    }
    .stat-icon {
      display: none;
    }
    .aging-content {
      gap: 17px;
      padding: 22px 16px;
    }
    .donut-wrap,
    .donut {
      width: 145px;
      height: 145px;
    }
    .donut-center {
      width: 112px;
      height: 112px;
      strong {
        font-size: 18px;
      }
    }
    .aging-legend > div small {
      display: none;
    }
  }

  .stat-label {
    color: $muted;
    font-size: 12px;
  }

  .stat-number {
    font-size: 30px;
  }

  .stat-footer {
    color: $muted;
    font-size: 12px;
    gap: 8px;
    flex-wrap: wrap;
    line-height: 1.6;
  }

  .light-tag {
    font-size: 12px;
  }

  .stat-card.featured .stat-footer {
    color: #c0cfe6;
  }

  .stat-card.featured .stat-label {
    color: $on-dark;
  }

  .metric-tag.amber {
    color: $warning;
  }

  .metric-tag.green {
    color: $success;
  }

  .metric-tag.neutral {
    color: $muted;
  }

  .chart-summary > span,
  .chart-legend {
    color: $muted;
    font-size: 12px;
  }

  .chart-caption > span {
    color: $muted;
    font-size: 12px;
  }

  .chart-caption .text-button {
    color: $muted;
    font-size: 12px;
  }

  .chart-y-labels {
    color: $muted;
    font-size: 12px;
  }

  .aging-legend > div {
    font-size: 12px;
  }

  .aging-legend > div > span {
    color: $muted;
  }

  .aging-legend > div strong {
    font-size: 12px;
  }

  .aging-legend > div small {
    color: $muted;
    font-size: 12px;
  }

  .donut-center span,
  .donut-center small {
    color: $muted;
  }

  .priority-panel td {
    font-size: 12px;
  }

  .priority-panel .customer-cell strong {
    font-size: 12px;
    color: $ink;
  }

  .overdue-days {
    font-size: 12px;
    color: $muted;
  }

  .activity-item p {
    font-size: 12px;
    color: $muted;
    line-height: 1.75;
  }

  .activity-item > div > span {
    font-size: 12px;
    color: $muted;
  }

  .promise-strip > div:first-child strong {
    color: $ink;
    font-size: 12px;
  }

  .promise-strip > div:first-child small {
    color: $muted;
    font-size: 12px;
  }

  .promise-strip > div:nth-child(2) span {
    color: $muted;
    font-size: 12px;
  }

  .promise-strip .text-button {
    color: $muted;
    font-size: 12px;
  }

  @media (max-width: 1200px) {
    .stat-footer {
      flex-wrap: wrap;
    }
    .chart-legend {
      font-size: 12px;
    }
    .chart-summary > span {
      font-size: 12px;
    }
  }

  @media (max-width: 760px) {
    .stat-number {
      font-size: 25px;
    }
    .stat-label {
      font-size: 12px;
    }
    .stat-footer,
    .light-tag {
      font-size: 12px;
    }
    .stat-footer > span:last-child {
      font-size: 12px;
    }
    .stat-card.featured .stat-footer {
      gap: 4px;
    }
    .aging-legend > div > span {
      font-size: 12px;
    }
    .aging-legend > div strong {
      font-size: 12px;
    }
    .chart-caption > span {
      font-size: 12px;
    }
  }
</style>
