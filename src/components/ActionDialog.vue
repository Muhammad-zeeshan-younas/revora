<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { z } from 'zod';
  import { analyzeReply } from '../../shared/assistant';
  import type { ReplyAnalysis } from '../../shared/assistant';
  import { COLLECTIONS } from '../../shared/constants';
  import { bankImportProfilesSchema, csvExport, inspectImport } from '../../shared/csv';
  import type { BankField, BankImportProfile, ImportReviewRow } from '../../shared/csv';
  import {
    BankDateFormat,
    CommandType,
    CommunicationChannel,
    CustomerStatus,
    InteractionOutcome,
    InvoiceStatus,
    MessageDirection,
    PaymentMethod,
    Role,
    ImportKind,
  } from '../../shared/enums';
  import { offsetDate, suggestMatch, today, toPaisa } from '../../shared/finance';
  import { commandSchema, inviteResultSchema, roleSchema } from '../../shared/schema';
  import type { Command, Workspace } from '../../shared/schema';
  import { notify } from '../composables/useNotifications';
  import { dialogCopy } from '../config/dialogs';
  import { ActionKind } from '../config/ui.enums';
  import { download } from '../lib/download';
  import { request } from '../lib/http-client';
  import { mutate, saving } from '../stores/workspace';
  import { queueFieldDraft } from '../stores/field-drafts';
  import type { Action } from '../types';
  import AllocationFields from './forms/AllocationFields.vue';
  import CreditFields from './forms/CreditFields.vue';
  import CustomerFields from './forms/CustomerFields.vue';
  import InteractionFields from './forms/InteractionFields.vue';
  import InvoiceFields from './forms/InvoiceFields.vue';
  import PaymentFields from './forms/PaymentFields.vue';
  import PromiseFields from './forms/PromiseFields.vue';
  import type { ActionForm } from './forms/action-form.types';
  import Icon from './ui/UiIcon.vue';
  import Modal from './ui/UiModal.vue';

  const IMPORT_COMMAND_TYPES = new Set<string>([
    CommandType.ImportCustomers,
    CommandType.ImportInvoices,
    CommandType.ImportPayments,
  ]);

  const BANK_FIELDS: { key: BankField; label: string }[] = [
    { key: 'date', label: 'Date' },
    { key: 'reference', label: 'Transaction reference' },
    { key: 'credit', label: 'Credit' },
    { key: 'debit', label: 'Debit' },
    { key: 'amount', label: 'Amount if no credit column' },
    { key: 'description', label: 'Description' },
    { key: 'bank', label: 'Bank' },
    { key: 'customer', label: 'Customer' },
  ];

  const HELP_STEPS = [
    {
      title: 'Bring your customers on board',
      text: 'Open Customers to add accounts or import a CSV. Download a template from the import dialog.',
    },
    {
      title: 'Get a clear view of receivables',
      text: 'Create or import invoices. The dashboard calculates balances, aging, and priority accounts immediately.',
    },
    {
      title: 'Keep your collections connected',
      text: 'Log calls and customer replies, draft payment promises, and prepare reminders in your local outbox.',
    },
    {
      title: 'Close the loop on payments',
      text: 'Import a bank statement, review proposed matches, and approve allocations. Partial and multi-invoice payments are supported.',
    },
  ];

  const props = defineProps<{
    action: Exclude<
      Action,
      { kind: ActionKind.Profile | ActionKind.InvoiceCorrection | ActionKind.BankReconciliation }
    >;
    workspace: Workspace;
  }>();
  const emit = defineEmits<{ close: [] }>();
  const error = ref('');
  const localPending = ref(false);
  const fileName = ref('');
  const csvText = ref('');
  const preview = ref<Command | null>(null);
  const previewCount = ref(0);
  const importReviewRows = ref<ImportReviewRow[]>([]);
  const importSkippedCount = ref(0);
  const importErrorCount = ref(0);
  const historySearch = ref('');
  const csvHeaders = ref<string[]>([]);
  const bankMapping = ref<Record<BankField, string>>({
    date: '',
    reference: '',
    credit: '',
    debit: '',
    amount: '',
    description: '',
    bank: '',
    customer: '',
  });
  const bankDateFormat = ref<BankDateFormat>(BankDateFormat.Iso);
  const bankProfiles = ref<BankImportProfile[]>([]);
  const selectedBankProfile = ref('');
  const bankProfileName = ref('');
  const analysis = ref<ReplyAnalysis | null>(null);
  const inviteLink = ref('');
  const allocations = ref<Record<string, string>>({});
  const customerId =
    'customerId' in props.action
      ? (props.action.customerId ?? props.workspace.customers[0]?.id ?? '')
      : (props.workspace.customers[0]?.id ?? '');
  const form = ref<ActionForm>({
    name: '',
    contact: '',
    email: '',
    phone: '+92',
    city: '',
    taxId: '',
    salesperson: 'Unassigned',
    creditLimit: '1000000',
    terms: 30,
    status: CustomerStatus.Active,
    customerId,
    number: `INV-${Math.max(2500, props.workspace.invoices.length + 2500)}`,
    issuedAt: today(),
    dueAt: offsetDate(today(), 30),
    amount: '',
    reference: '',
    bank: 'HBL',
    description: '',
    method: PaymentMethod.BankTransfer,
    date: offsetDate(today(), 1),
    message: '',
    channel: CommunicationChannel.Phone,
    outcome: InteractionOutcome.Note,
    direction: MessageDirection.Internal,
    nextAction: '',
    reason: '',
    role: Role.Viewer,
    orderAmount: '',
  });

  const importHistory = computed(() =>
    props.workspace.audit.filter(
      (event) =>
        IMPORT_COMMAND_TYPES.has(event.action) &&
        `${event.action} ${event.detail} ${event.actor}`
          .toLowerCase()
          .includes(historySearch.value.toLowerCase().trim()),
    ),
  );
  const payment = computed(() => {
    const action = props.action;

    return 'paymentId' in action
      ? props.workspace.payments.find((item) => item.id === action.paymentId)
      : undefined;
  });
  const invoice = computed(() => {
    const action = props.action;

    return action.kind === ActionKind.Dispute
      ? props.workspace.invoices.find((item) => item.id === action.invoiceId)
      : undefined;
  });
  const suggestion = computed(() =>
    payment.value ? suggestMatch(props.workspace, payment.value) : null,
  );
  const title = computed(() => {
    if (props.action.kind === ActionKind.Import) {
      return (
        'Import ' +
        (props.action.importKind === ImportKind.Payments
          ? 'bank statement'
          : props.action.importKind)
      );
    }
    if (
      props.action.kind === ActionKind.Dispute &&
      invoice.value?.status === InvoiceStatus.Disputed
    ) {
      return 'Resolve invoice dispute';
    }

    return dialogCopy[props.action.kind].title;
  });
  const selectedCustomer = computed(() =>
    props.workspace.customers.find((item) => item.id === form.value.customerId),
  );
  const remainingPayment = computed(() =>
    payment.value
      ? payment.value.amount -
        payment.value.allocations.reduce((sum, allocation) => sum + allocation.amount, 0)
      : 0,
  );
  const allocationTotal = computed(
    () =>
      Object.values(allocations.value).reduce((sum, value) => sum + (Number(value) || 0), 0) * 100,
  );
  const submitLabel = computed(() => {
    if (props.action.kind === ActionKind.Import) {
      return 'Import ' + previewCount.value + ' rows';
    }

    return dialogCopy[props.action.kind].submitLabel;
  });
  const isBusy = computed(() => saving.value || localPending.value);

  function initializeForm(): void {
    if (props.action.kind === ActionKind.Payment) {
      form.value.date = today();
    }

    if (props.action.kind === ActionKind.EditCustomer) {
      const customerId = props.action.customerId;
      const customer = props.workspace.customers.find((item) => item.id === customerId);

      if (customer) {
        Object.assign(form.value, {
          name: customer.name,
          contact: customer.contact,
          email: customer.email,
          phone: customer.phone,
          city: customer.city,
          taxId: customer.taxId,
          salesperson: customer.salesperson,
          terms: customer.terms,
          status: customer.status,
        });
      }
    }

    if (props.action.kind === ActionKind.Credit) {
      const customer = props.workspace.customers.find((item) => item.id === form.value.customerId);

      form.value.creditLimit = String((customer?.creditLimit ?? 0) / 100);
    }

    if (props.action.kind === ActionKind.Match) {
      form.value.customerId = suggestion.value?.customer.id ?? payment.value?.customerId ?? '';

      for (const item of suggestion.value?.allocations ?? []) {
        allocations.value[item.invoiceId] = String(item.amount / 100);
      }
    }
  }

  function applyBankProfile(): void {
    const profile = bankProfiles.value.find((item) => item.name === selectedBankProfile.value);
    if (!profile) {
      return;
    }

    bankMapping.value = { ...profile.columns };
    bankDateFormat.value = profile.dateFormat;
    bankProfileName.value = profile.name;
    clearImportReview();

    if (csvText.value) {
      validateCsv();
    }
  }

  async function saveBankProfile(): Promise<void> {
    if (!preview.value || preview.value.type !== CommandType.ImportPayments) {
      error.value = 'Validate a bank statement before saving its mapping.';

      return;
    }

    localPending.value = true;

    try {
      bankProfiles.value = await request(
        '/workspace/bank-import-profiles',
        bankImportProfilesSchema,
        {
          name: bankProfileName.value,
          columns: bankMapping.value,
          dateFormat: bankDateFormat.value,
        },
      );
      selectedBankProfile.value = bankProfileName.value.trim();
      notify('Bank import mapping saved for your company.');
    } catch (cause) {
      displayError(cause instanceof Error ? cause : new Error('Could not save bank mapping.'));
    } finally {
      localPending.value = false;
    }
  }

  function clearImportReview(): void {
    preview.value = null;
    previewCount.value = 0;
    importReviewRows.value = [];
    importSkippedCount.value = 0;
    importErrorCount.value = 0;
  }

  function onCsvTextInput(): void {
    fileName.value = '';
    clearImportReview();
  }

  function draftReply(): void {
    analysis.value = analyzeReply(form.value.message, today());
    if (analysis.value.amount !== null) {
      form.value.amount = String(analysis.value.amount / 100);
    }
    if (analysis.value.date) {
      form.value.date = analysis.value.date;
    }
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
      error.value = 'Choose a CSV smaller than 1.5 MB (up to 1,000 rows).';

      return;
    }
    fileName.value = file.name;
    csvText.value = await file.text();
    clearImportReview();
    validateCsv();
  }

  function validateCsv(): void {
    if (props.action.kind !== ActionKind.Import) {
      return;
    }
    error.value = '';
    clearImportReview();
    csvHeaders.value = [];
    try {
      const review = inspectImport(props.action.importKind, csvText.value, props.workspace, {
        columns: bankMapping.value,
        dateFormat: bankDateFormat.value,
      });
      csvHeaders.value = review.headers;
      preview.value = review.command;
      previewCount.value = review.readyCount;
      importReviewRows.value = review.rows;
      importSkippedCount.value = review.skippedCount;
      importErrorCount.value = review.errorCount;
    } catch (cause) {
      displayError(cause instanceof Error ? cause : new Error('CSV is invalid.'));
    }
  }

  function downloadImportTemplate(): void {
    if (props.action.kind !== ActionKind.Import) {
      return;
    }

    const customer = props.workspace.customers[0]?.name ?? 'Example Traders';
    let content: string;

    switch (props.action.importKind) {
      case ImportKind.Customers:
        content = csvExport(
          [
            'name',
            'contact',
            'email',
            'phone',
            'city',
            'credit_limit',
            'terms',
            'tax_id',
            'salesperson',
          ],
          [
            [
              'Example Traders',
              'Ali Hassan',
              'ali@example.com',
              '+923001234567',
              'Lahore',
              '500000',
              '30',
              'NTN-123456',
              'Adeel Khan',
            ],
          ],
        );
        break;

      case ImportKind.Invoices:
        content = csvExport(
          ['number', 'customer', 'issued_at', 'due_at', 'amount', 'reference'],
          [['INV-IMPORT-001', customer, today(), offsetDate(today(), 30), '150000', 'ERP-001']],
        );
        break;

      case ImportKind.Payments:
        content = csvExport(
          ['date', 'description', 'debit', 'credit', 'reference', 'bank', 'customer'],
          [[today(), `${customer} settlement`, '0', '150000', 'BANK-IMPORT-001', 'HBL', customer]],
        );
        break;
    }

    download(`revora-${props.action.importKind}-template.csv`, content);
  }

  function displayError(cause: Error): void {
    error.value =
      cause instanceof z.ZodError
        ? cause.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')
        : cause.message;
  }

  async function submit(asFieldDraft = false): Promise<void> {
    error.value = '';
    try {
      let command: Command | null = null;
      switch (props.action.kind) {
        case ActionKind.Customer:
          command = commandSchema.parse({
            type: CommandType.CreateCustomer,
            customer: {
              name: form.value.name,
              contact: form.value.contact,
              email: form.value.email,
              phone: form.value.phone,
              city: form.value.city,
              taxId: form.value.taxId,
              salesperson: form.value.salesperson,
              creditLimit: toPaisa(form.value.creditLimit),
              terms: form.value.terms,
              status: CustomerStatus.Active,
            },
          });
          break;
        case ActionKind.EditCustomer:
          command = commandSchema.parse({
            type: CommandType.UpdateCustomer,
            customerId: props.action.customerId,
            customer: {
              name: form.value.name,
              contact: form.value.contact,
              email: form.value.email,
              phone: form.value.phone,
              city: form.value.city,
              taxId: form.value.taxId,
              salesperson: form.value.salesperson,
              terms: form.value.terms,
              status: form.value.status,
            },
          });
          break;
        case ActionKind.Invoice:
          command = commandSchema.parse({
            type: CommandType.CreateInvoice,
            invoice: {
              number: form.value.number,
              customerId: form.value.customerId,
              issuedAt: form.value.issuedAt,
              dueAt: form.value.dueAt,
              amount: toPaisa(form.value.amount),
              reference: form.value.reference,
              status: InvoiceStatus.Open,
            },
          });
          break;
        case ActionKind.Payment:
          command = commandSchema.parse({
            type: CommandType.CreatePayment,
            payment: {
              customerId: form.value.customerId,
              amount: toPaisa(form.value.amount),
              date: form.value.date,
              reference: form.value.reference,
              bank: form.value.bank,
              method: form.value.method,
              description: form.value.description,
            },
          });
          break;
        case ActionKind.Promise:
          command = commandSchema.parse({
            type: CommandType.CreatePromise,
            customerId: form.value.customerId,
            amount: toPaisa(form.value.amount),
            date: form.value.date,
            note: form.value.message,
          });
          break;
        case ActionKind.Interaction:
          command = commandSchema.parse({
            type: CommandType.CreateInteraction,
            interaction: {
              customerId: form.value.customerId,
              channel: form.value.channel,
              message: form.value.message,
              outcome: form.value.outcome,
              nextAction: form.value.nextAction,
              direction: form.value.direction,
            },
          });
          break;
        case ActionKind.Credit:
          command = commandSchema.parse({
            type: CommandType.UpdateCredit,
            customerId: form.value.customerId,
            limit: toPaisa(form.value.creditLimit),
            reason: form.value.reason,
          });
          break;
        case ActionKind.Match:
          command = commandSchema.parse({
            type: CommandType.AllocatePayment,
            paymentId: props.action.paymentId,
            customerId: form.value.customerId,
            allocations: Object.entries(allocations.value)
              .filter(([, value]) => Number(value) > 0)
              .map(([invoiceId, value]) => ({ invoiceId, amount: toPaisa(value) })),
          });
          break;
        case ActionKind.Reverse:
          command = {
            type: CommandType.ReversePayment,
            paymentId: props.action.paymentId,
            reason: form.value.reason,
          };
          break;
        case ActionKind.Dispute:
          command = {
            type: CommandType.DisputeInvoice,
            invoiceId: props.action.invoiceId,
            disputed: invoice.value?.status !== InvoiceStatus.Disputed,
            reason: form.value.reason,
          };
          break;
        case ActionKind.Import:
          if (!preview.value) {
            throw new Error('Validate your CSV before importing.');
          }
          command = commandSchema.parse({
            ...preview.value,
            sourceName: fileName.value || 'Pasted CSV',
          });
          break;
        case ActionKind.Invite: {
          localPending.value = true;
          const result = await request('/auth/invite', inviteResultSchema, {
            email: form.value.email,
            role: form.value.role,
          });
          inviteLink.value = result.link;
          notify('Invitation link created. Share it with your teammate.');

          return;
        }
        case ActionKind.Help:
          return;
      }
      if (command) {
        const validatedCommand = commandSchema.parse(command);
        if (
          asFieldDraft ||
          (!navigator.onLine &&
            [CommandType.CreateInteraction, CommandType.CreatePromise].includes(
              validatedCommand.type,
            ))
        ) {
          queueFieldDraft(validatedCommand);
          notify('Field draft saved on this device. Sync it from Collections when online.');
          emit('close');

          return;
        }
        await mutate(validatedCommand);
        notify(
          props.action.kind === ActionKind.Match
            ? 'Payment allocated. Customer balances are up to date.'
            : props.action.kind === ActionKind.Import
              ? `${previewCount.value} rows imported successfully.`
              : 'Saved to your workspace.',
        );
        emit('close');
      }
    } catch (cause) {
      displayError(cause instanceof Error ? cause : new Error('Unable to save. Please retry.'));
    } finally {
      localPending.value = false;
    }
  }

  async function copyInvite(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteLink.value);
      notify('Invitation link copied.');
    } catch {
      error.value = 'Select and copy the invitation link below.';
    }
  }

  function selectInput(event: FocusEvent): void {
    if (event.target instanceof HTMLInputElement) {
      event.target.select();
    }
  }

  initializeForm();

  onMounted(async () => {
    if (
      props.action.kind !== ActionKind.Import ||
      props.action.importKind !== ImportKind.Payments
    ) {
      return;
    }

    try {
      bankProfiles.value = await request(
        '/workspace/bank-import-profiles',
        bankImportProfilesSchema,
      );
    } catch (cause) {
      displayError(cause instanceof Error ? cause : new Error('Could not load saved mappings.'));
    }
  });
</script>
<template>
  <Modal
    :title="title"
    :subtitle="
      selectedCustomer &&
      [ActionKind.Promise, ActionKind.Interaction, ActionKind.Credit].includes(action.kind)
        ? selectedCustomer.name
        : action.kind === ActionKind.Match
          ? 'Review the details before updating your ledger.'
          : undefined
    "
    :wide="action.kind === ActionKind.Match || action.kind === ActionKind.Import"
    @close="!isBusy && emit('close')"
  >
    <div
      v-if="action.kind === ActionKind.Help"
      class="help-steps"
    >
      <article
        v-for="(step, index) in HELP_STEPS"
        :key="step.title"
      >
        <span>{{ index + 1 }}</span>
        <div>
          <h3>{{ step.title }}</h3>
          <p>{{ step.text }}</p>
        </div>
      </article>
      <div class="info-note">
        <Icon name="shield" />
        <p>
          This pilot has a local reminder outbox and rule-based reply assistant. Live messaging, LLM
          extraction, MFA, and direct ERP connections require additional integration work.
        </p>
      </div>
    </div>
    <form
      v-else
      @submit.prevent="submit(false)"
    >
      <CustomerFields
        v-if="action.kind === ActionKind.Customer || action.kind === ActionKind.EditCustomer"
        v-model="form"
        :editing="action.kind === ActionKind.EditCustomer"
      />
      <InvoiceFields
        v-else-if="action.kind === ActionKind.Invoice"
        v-model="form"
        :workspace="workspace"
      />
      <PaymentFields
        v-else-if="action.kind === ActionKind.Payment"
        v-model="form"
        :workspace="workspace"
      />
      <InteractionFields
        v-else-if="action.kind === ActionKind.Interaction"
        v-model="form"
      />
      <PromiseFields
        v-else-if="action.kind === ActionKind.Promise"
        v-model="form"
        :workspace="workspace"
        :analysis="analysis"
        @draft="draftReply"
      />
      <CreditFields
        v-else-if="action.kind === ActionKind.Credit"
        v-model="form"
        :workspace="workspace"
      />
      <AllocationFields
        v-else-if="action.kind === ActionKind.Match && payment"
        v-model="form"
        v-model:allocations="allocations"
        :workspace="workspace"
        :payment="payment"
        :suggestion="suggestion"
      />
      <template
        v-else-if="action.kind === ActionKind.Reverse || action.kind === ActionKind.Dispute"
      >
        <div class="info-note warning-note">
          <Icon
            name="warning"
            :size="24"
          />
          <p>
            {{
              action.kind === ActionKind.Reverse
                ? `Reversing ${payment?.reference ?? ''} restores its allocated invoice balances. The original allocation record remains in the audit history.`
                : `${invoice?.number ?? ''}: ${invoice?.status === InvoiceStatus.Disputed ? 'Resolving the dispute allows payment allocation again.' : 'A disputed invoice remains outstanding and is excluded from payment matches.'}`
            }}
          </p>
        </div>
        <label>
          Reason
          <textarea
            v-model="form.reason"
            rows="4"
            minlength="5"
            required
            placeholder="Explain the reason for this action."
          ></textarea>
        </label>
      </template>
      <template v-else-if="action.kind === ActionKind.Import">
        <div class="import-intro">
          <p>
            Upload a CSV with up to 1,000 rows. Amounts should be in rupees and dates in YYYY-MM-DD
            format.
          </p>
          <button
            type="button"
            class="text-button"
            @click="downloadImportTemplate"
          >
            <Icon
              name="download"
              :size="17"
            />
            Download template
          </button>
        </div>
        <label class="upload-zone">
          <Icon
            name="csv"
            :size="36"
          />
          <strong>{{ fileName || 'Choose your CSV file' }}</strong>
          <span>Click to browse · CSV up to 1.5 MB</span>
          <input
            type="file"
            accept=".csv,text/csv"
            @change="readFile"
          />
        </label>
        <label>
          Or paste CSV content
          <textarea
            v-model="csvText"
            rows="6"
            placeholder="Paste your CSV headers and rows here…"
            @input="onCsvTextInput"
          ></textarea>
        </label>
        <div
          v-if="action.importKind === ImportKind.Payments && csvHeaders.length"
          class="bank-mapping"
        >
          <strong>Bank statement format</strong>
          <label v-if="bankProfiles.length">
            Saved mapping
            <select
              v-model="selectedBankProfile"
              @change="applyBankProfile"
            >
              <option value="">Choose a mapping</option>
              <option
                v-for="profile in bankProfiles"
                :key="profile.name"
                :value="profile.name"
              >
                {{ profile.name }}
              </option>
            </select>
          </label>
          <label>
            Date format
            <select
              v-model="bankDateFormat"
              @change="clearImportReview"
            >
              <option :value="BankDateFormat.Iso">YYYY-MM-DD</option>
              <option :value="BankDateFormat.DayMonthYear">DD/MM/YYYY</option>
            </select>
          </label>
          <div class="form-grid">
            <label
              v-for="field in BANK_FIELDS"
              :key="field.key"
            >
              {{ field.label }}
              <select
                v-model="bankMapping[field.key]"
                @change="clearImportReview"
              >
                <option value="">Detect automatically</option>
                <option
                  v-for="header in csvHeaders"
                  :key="header"
                  :value="header"
                >
                  {{ header }}
                </option>
              </select>
            </label>
          </div>
          <div class="form-grid">
            <label>
              Mapping name
              <input
                v-model="bankProfileName"
                minlength="2"
                maxlength="60"
                placeholder="e.g. HBL statement"
              />
            </label>
            <button
              type="button"
              class="button small"
              :disabled="!preview || bankProfileName.trim().length < 2 || isBusy"
              @click="saveBankProfile"
            >
              Save validated mapping
            </button>
          </div>
        </div>
        <button
          type="button"
          class="button small"
          :disabled="!csvText"
          @click="validateCsv"
        >
          <Icon
            name="checkCircle"
            :size="17"
          />
          Validate import
        </button>
        <div
          v-if="importReviewRows.length"
          class="import-preview"
        >
          <Icon
            name="checkCircle"
            :size="24"
          />
          <div>
            <strong>
              {{ previewCount }} ready · {{ importSkippedCount }} skipped ·
              {{ importErrorCount }} errors
            </strong>
            <p>
              Every row is shown below. Fix errors and validate again before importing the batch.
            </p>
          </div>
        </div>
        <div
          v-if="importReviewRows.length"
          class="import-sample import-all-rows"
        >
          <strong>All {{ importReviewRows.length }} data rows</strong>
          <table>
            <thead>
              <tr>
                <th>CSV row</th>
                <th>Record</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in importReviewRows"
                :key="row.rowNumber"
              >
                <td>{{ row.rowNumber }}</td>
                <td>{{ row.summary }}</td>
                <td>{{ row.status }}</td>
                <td>{{ row.issue || 'Ready to import' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="import-sample">
          <strong>Successful import history</strong>
          <label>
            Search history
            <input
              v-model="historySearch"
              type="search"
              placeholder="Type, file, or teammate"
            />
          </label>
          <p
            v-if="!importHistory.length"
            class="muted"
          >
            No matching imports yet.
          </p>
          <table v-else>
            <thead>
              <tr>
                <th>When</th>
                <th>By</th>
                <th>Import</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="event in importHistory"
                :key="event.id"
              >
                <td>{{ new Date(event.at).toLocaleString('en-PK') }}</td>
                <td>{{ event.actor }}</td>
                <td>{{ event.detail }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <template v-else-if="action.kind === ActionKind.Invite">
        <p class="muted">
          Create a private invitation link for a teammate. It expires after 48 hours and can be used
          once.
        </p>
        <label>
          Email address
          <input
            v-model="form.email"
            type="email"
            required
            placeholder="teammate@company.com"
          />
        </label>
        <label>
          Role
          <select v-model="form.role">
            <option
              v-for="role in roleSchema.options.filter((item) => item !== Role.Owner)"
              :key="role"
            >
              {{ role }}
            </option>
          </select>
        </label>
        <div
          v-if="inviteLink"
          class="invite-result"
        >
          <label>
            Invitation link
            <input
              :value="inviteLink"
              readonly
              @focus="selectInput"
            />
          </label>
          <button
            type="button"
            class="button small"
            @click="copyInvite"
          >
            <Icon
              name="copy"
              :size="16"
            />
            Copy invitation
          </button>
        </div>
      </template>
      <p
        v-if="error"
        class="form-error"
        role="alert"
      >
        {{ error }}
      </p>
      <footer class="modal-footer">
        <button
          v-if="action.kind === ActionKind.Interaction || action.kind === ActionKind.Promise"
          type="button"
          class="button"
          :disabled="isBusy"
          @click="submit(true)"
        >
          Save field draft
        </button>
        <button
          type="button"
          class="button"
          :disabled="isBusy"
          @click="emit('close')"
        >
          {{ inviteLink ? 'Done' : 'Cancel' }}
        </button>
        <button
          v-if="!inviteLink"
          class="button primary"
          :disabled="
            isBusy ||
            (action.kind === ActionKind.Import && !preview) ||
            (action.kind === ActionKind.Match &&
              (allocationTotal <= 0 || allocationTotal > remainingPayment))
          "
        >
          <Icon
            v-if="isBusy"
            name="spinner"
            class="spin"
            :size="17"
          />
          <Icon
            v-else
            :name="action.kind === ActionKind.Match ? 'checkCircle' : 'check'"
            :size="17"
          />
          {{ isBusy ? 'Saving…' : submitLabel }}
        </button>
      </footer>
    </form>
  </Modal>
</template>

<style scoped lang="scss" src="./ActionDialog.scss"></style>
