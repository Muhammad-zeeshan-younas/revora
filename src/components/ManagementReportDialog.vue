<script setup lang="ts">
  import { onMounted, ref, watch } from 'vue';
  import { z } from 'zod';
  import { csvExport } from '../../shared/csv';
  import { formatMoney } from '../../shared/finance';
  import { notify } from '../composables/useNotifications';
  import { download } from '../lib/download';
  import { request } from '../lib/http-client';
  import Modal from './ui/UiModal.vue';

  const reportSchema = z.object({
    periodStart: z.string(),
    periodEnd: z.string(),
    generatedAt: z.string(),
    opening: z.number(),
    creditSales: z.number(),
    collected: z.number(),
    closing: z.number(),
    currentClosing: z.number(),
    dsoDays: z.number().nullable(),
    collectionEffectivenessPercent: z.number().nullable(),
    customers: z.array(
      z.object({
        customerId: z.string(),
        customerName: z.string(),
        opening: z.number(),
        sales: z.number(),
        collected: z.number(),
        closing: z.number(),
        overdue: z.number(),
      }),
    ),
  });
  const historySchema = z.array(z.object({ month: z.string(), generatedAt: z.string() }));

  const emit = defineEmits<{ close: [] }>();
  const month = ref(new Date().toISOString().slice(0, 7));
  const report = ref<z.infer<typeof reportSchema> | null>(null);
  const history = ref<z.infer<typeof historySchema>>([]);
  const error = ref('');
  const busy = ref(false);

  async function load(): Promise<void> {
    busy.value = true;
    error.value = '';
    try {
      report.value = await request(`/workspace/reports/${month.value}`, reportSchema);
      history.value = await request('/workspace/reports', historySchema);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not load report.';
    } finally {
      busy.value = false;
    }
  }

  function exportReport(): void {
    if (!report.value) {return;}
    const current = report.value;
    download(
      `revora-management-${month.value}.csv`,
      csvExport(
        [
          'Customer',
          'Opening PKR',
          'Credit sales PKR',
          'Collected PKR',
          'Closing PKR',
          'Overdue PKR',
        ],
        current.customers.map((row) => [
          row.customerName,
          String(row.opening / 100),
          String(row.sales / 100),
          String(row.collected / 100),
          String(row.closing / 100),
          String(row.overdue / 100),
        ]),
      ),
    );
    notify('Management report exported.');
  }

  watch(month, () => void load());
  onMounted(() => void load());
</script>

<template>
  <Modal
    title="Management report"
    subtitle="Monthly receivables and collection performance"
    wide
    @close="emit('close')"
  >
    <div class="report-toolbar">
      <label>
        Report month
        <input
          v-model="month"
          type="month"
          :max="new Date().toISOString().slice(0, 7)"
        />
      </label>
      <button
        class="button small"
        :disabled="!report || busy"
        @click="exportReport"
      >
        Export customer detail CSV
      </button>
    </div>
    <p
      v-if="error"
      role="alert"
      class="text-red"
    >
      {{ error }}
    </p>
    <p v-if="busy">Loading report…</p>
    <template v-if="report">
      <p>
        Period: {{ report.periodStart }} to {{ report.periodEnd }}. Closed months are saved
        automatically.
      </p>
      <div class="report-metrics">
        <div>
          <span>Closing receivables</span>
          <strong>{{ formatMoney(report.closing) }}</strong>
        </div>
        <div>
          <span>Credit sales</span>
          <strong>{{ formatMoney(report.creditSales) }}</strong>
        </div>
        <div>
          <span>Allocated collections</span>
          <strong>{{ formatMoney(report.collected) }}</strong>
        </div>
        <div>
          <span>DSO</span>
          <strong>{{ report.dsoDays ?? '—' }} days</strong>
        </div>
        <div>
          <span>Collection effectiveness</span>
          <strong>{{ report.collectionEffectivenessPercent ?? '—' }}%</strong>
        </div>
      </div>
      <p class="report-method">
        DSO = closing receivables ÷ credit sales × days in period. Collection effectiveness =
        (opening receivables + credit sales − closing receivables) ÷ (opening receivables + credit
        sales − closing balances not yet due). Credits and write-offs can affect collection
        effectiveness, so compare it with allocated collections. A dash means there is no valid
        denominator. Reversed payments are excluded.
      </p>
      <div class="report-table">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Opening</th>
              <th>Sales</th>
              <th>Collected</th>
              <th>Closing</th>
              <th>Overdue</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in report.customers"
              :key="row.customerId"
            >
              <td>{{ row.customerName }}</td>
              <td>{{ formatMoney(row.opening) }}</td>
              <td>{{ formatMoney(row.sales) }}</td>
              <td>{{ formatMoney(row.collected) }}</td>
              <td>{{ formatMoney(row.closing) }}</td>
              <td>{{ formatMoney(row.overdue) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="history.length">
        Scheduled snapshots: {{ history.map((item) => item.month).join(', ') }}
      </p>
    </template>
  </Modal>
</template>

<style scoped>
  .report-toolbar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
  }
  .report-toolbar label {
    display: grid;
    gap: 0.35rem;
  }
  .report-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
    margin: 1rem 0;
  }
  .report-metrics div {
    display: grid;
    gap: 0.25rem;
    padding: 0.75rem;
    background: #f5f7fb;
    border-radius: 0.5rem;
  }
  .report-metrics span,
  .report-method {
    color: #64748b;
  }
  .report-table {
    overflow: auto;
    max-height: 20rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
  }
</style>
