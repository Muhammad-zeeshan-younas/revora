<script setup lang="ts">
  import { ref } from 'vue';
  import { COLLECTIONS } from '../../shared/constants';
  import { csvExport, parseBankStatementRows } from '../../shared/csv';
  import { BankDateFormat, CommandType } from '../../shared/enums';
  import { formatMoney, today } from '../../shared/finance';
  import { reconcileBankStatement, signedRupeesToPaisa } from '../../shared/reconciliation';
  import type { ReconciliationResult } from '../../shared/reconciliation';
  import { commandSchema } from '../../shared/schema';
  import type { Command, Workspace } from '../../shared/schema';
  import { notify } from '../composables/useNotifications';
  import { download } from '../lib/download';
  import { mutate, saving } from '../stores/workspace';
  import Modal from './ui/UiModal.vue';

  type ReconciliationCommand = Extract<Command, { type: CommandType.RecordBankReconciliation }>;
  const RECENT_RECONCILIATION_LIMIT = 10;

  const props = defineProps<{ workspace: Workspace }>();
  const emit = defineEmits<{ close: [] }>();

  const bank = ref('HBL');
  const openingBalance = ref('0');
  const closingBalance = ref('0');
  const dateFormat = ref<BankDateFormat>(BankDateFormat.Iso);
  const csvText = ref('');
  const fileName = ref('');
  const error = ref('');
  const preview = ref<ReconciliationResult | null>(null);
  const draft = ref<ReconciliationCommand | null>(null);

  function clearPreview(): void {
    preview.value = null;
    draft.value = null;
    error.value = '';
  }

  function onTextInput(): void {
    fileName.value = '';
    clearPreview();
  }

  function downloadTemplate(): void {
    const source = csvExport(
      ['date', 'reference', 'credit', 'debit', 'bank'],
      [
        [today(), 'BANK-CREDIT-001', '1000', '0', bank.value],
        [today(), 'BANK-DEBIT-001', '0', '250', bank.value],
      ],
    );

    download('revora-bank-reconciliation-template.csv', source);
  }

  async function readFile(event: Event): Promise<void> {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > COLLECTIONS.maximumCsvBytes) {
      error.value = 'Choose a CSV smaller than 1.5 MB.';

      return;
    }

    fileName.value = file.name;
    csvText.value = await file.text();
    clearPreview();
  }

  function prepare(): void {
    clearPreview();

    try {
      const entries = parseBankStatementRows(csvText.value, bank.value, {
        dateFormat: dateFormat.value,
      });
      const command = commandSchema.parse({
        type: CommandType.RecordBankReconciliation,
        bank: bank.value,
        openingBalance: signedRupeesToPaisa(openingBalance.value),
        closingBalance: signedRupeesToPaisa(closingBalance.value),
        sourceName: fileName.value || 'Pasted CSV',
        entries,
      });
      if (command.type !== CommandType.RecordBankReconciliation) {
        throw new Error('Unable to prepare the statement.');
      }

      draft.value = command;
      preview.value = reconcileBankStatement(props.workspace, command);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Statement is invalid.';
    }
  }

  async function save(): Promise<void> {
    if (!draft.value) {
      return;
    }

    try {
      await mutate(draft.value);
      notify('Bank reconciliation recorded with its exceptions.');
      emit('close');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not save reconciliation.';
    }
  }
</script>

<template>
  <Modal
    title="Reconcile a bank statement"
    subtitle="Compare statement credits with recorded receipts and check the opening-to-closing balance."
    wide
    @close="!saving && emit('close')"
  >
    <div class="reconciliation-fields">
      <label>
        Bank
        <input
          v-model="bank"
          required
          @input="clearPreview"
        />
      </label>
      <label>
        Opening balance in PKR
        <input
          v-model="openingBalance"
          type="number"
          step="0.01"
          @input="clearPreview"
        />
      </label>
      <label>
        Closing balance in PKR
        <input
          v-model="closingBalance"
          type="number"
          step="0.01"
          @input="clearPreview"
        />
      </label>
      <label>
        Date format
        <select
          v-model="dateFormat"
          @change="clearPreview"
        >
          <option :value="BankDateFormat.Iso">YYYY-MM-DD</option>
          <option :value="BankDateFormat.DayMonthYear">DD/MM/YYYY</option>
        </select>
      </label>
    </div>

    <button
      type="button"
      class="text-button"
      @click="downloadTemplate"
    >
      Download statement template
    </button>

    <label>
      Statement CSV, up to 1,000 rows
      <input
        type="file"
        accept=".csv,text/csv"
        @change="readFile"
      />
    </label>
    <label>
      Or paste CSV
      <textarea
        v-model="csvText"
        rows="5"
        @input="onTextInput"
      ></textarea>
    </label>

    <p
      v-if="error"
      class="form-error"
      role="alert"
    >
      {{ error }}
    </p>

    <button
      type="button"
      class="button small"
      :disabled="!csvText || saving"
      @click="prepare"
    >
      Review reconciliation
    </button>

    <section v-if="preview">
      <h3>{{ preview.bank }} · {{ preview.periodStart }} to {{ preview.periodEnd }}</h3>
      <p>
        Credits {{ formatMoney(preview.creditTotal) }} · Debits
        {{ formatMoney(preview.debitTotal) }} · Matched {{ preview.matchedCount }}
      </p>
      <p>
        Balance difference:
        <strong>{{ formatMoney(preview.balanceDifference) }}</strong>
        · {{ preview.issues.length }} exception(s)
      </p>
      <div class="exception-list">
        <p v-if="!preview.issues.length">No exceptions found.</p>
        <article
          v-for="(issue, index) in preview.issues"
          :key="`${issue.reference}-${issue.kind}-${index}`"
        >
          <strong>{{ issue.kind }} {{ issue.reference }}</strong>
          <p>{{ issue.detail }}</p>
        </article>
      </div>
      <button
        type="button"
        class="button small"
        :disabled="saving"
        @click="save"
      >
        Record reviewed statement
      </button>
    </section>

    <section v-if="workspace.bankReconciliations.length">
      <h3>Previous reconciliations</h3>
      <article
        v-for="report in workspace.bankReconciliations.slice(0, RECENT_RECONCILIATION_LIMIT)"
        :key="report.id"
      >
        {{ report.bank }} · {{ report.periodStart }} to {{ report.periodEnd }} ·
        {{ report.issues.length }} exception(s) · {{ report.sourceName }}
      </article>
    </section>
  </Modal>
</template>

<style scoped>
  .reconciliation-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
  }

  label,
  section {
    display: grid;
    gap: 0.5rem;
    margin-block: 1rem;
  }

  .exception-list {
    max-height: 240px;
    overflow: auto;
  }

  .exception-list article {
    border-top: 1px solid var(--border, #dce3ee);
    padding-block: 0.5rem;
  }
</style>
