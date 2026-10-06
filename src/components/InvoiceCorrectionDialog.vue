<script setup lang="ts">
  import { computed, ref } from 'vue';
  import {
    CommandType,
    InvoiceAdjustmentDirection,
    Role,
    WriteOffStatus,
  } from '../../shared/enums';
  import { balance, formatMoney, toPaisa } from '../../shared/finance';
  import { commandSchema } from '../../shared/schema';
  import type { Command, Session, Workspace } from '../../shared/schema';
  import { notify } from '../composables/useNotifications';
  import type { ActionKind } from '../config/ui.enums';
  import { mutate, saving } from '../stores/workspace';
  import Modal from './ui/UiModal.vue';

  const props = defineProps<{
    action: { kind: ActionKind.InvoiceCorrection; invoiceId: string };
    workspace: Workspace;
    session: Session;
  }>();
  const emit = defineEmits<{ close: [] }>();

  const error = ref('');
  const direction = ref<InvoiceAdjustmentDirection>(InvoiceAdjustmentDirection.Decrease);
  const adjustmentAmount = ref('');
  const adjustmentReason = ref('');
  const creditNoteNumber = ref('');
  const creditNoteAmount = ref('');
  const creditNoteReason = ref('');
  const writeOffReason = ref('');
  const reviewReason = ref('');

  const invoice = computed(() =>
    props.workspace.invoices.find((item) => item.id === props.action.invoiceId),
  );
  const corrections = computed(() =>
    props.workspace.invoiceCorrections.filter((item) => item.invoiceId === props.action.invoiceId),
  );
  const requests = computed(() =>
    props.workspace.writeOffRequests.filter((item) => item.invoiceId === props.action.invoiceId),
  );
  const pendingRequest = computed(() =>
    requests.value.find((item) => item.status === WriteOffStatus.Pending),
  );
  const canCorrect = computed(() =>
    [Role.Owner, Role.Admin, Role.Accountant].includes(props.session.user.role),
  );
  const canReview = computed(() => [Role.Owner, Role.Admin].includes(props.session.user.role));

  async function execute(makeCommand: () => Command, message: string): Promise<void> {
    error.value = '';

    try {
      await mutate(commandSchema.parse(makeCommand()));
      notify(message);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not update this invoice.';
    }
  }

  async function submitAdjustment(): Promise<void> {
    await execute(
      () => ({
        type: CommandType.AdjustInvoice,
        invoiceId: props.action.invoiceId,
        direction: direction.value,
        amount: toPaisa(adjustmentAmount.value),
        reason: adjustmentReason.value,
      }),
      'Invoice adjustment recorded.',
    );
  }

  async function submitCreditNote(): Promise<void> {
    await execute(
      () => ({
        type: CommandType.IssueCreditNote,
        invoiceId: props.action.invoiceId,
        number: creditNoteNumber.value,
        amount: toPaisa(creditNoteAmount.value),
        reason: creditNoteReason.value,
      }),
      'Internal credit note recorded.',
    );
  }

  async function requestWriteOff(): Promise<void> {
    await execute(
      () => ({
        type: CommandType.RequestWriteOff,
        invoiceId: props.action.invoiceId,
        reason: writeOffReason.value,
      }),
      'Write-off sent for review.',
    );
  }

  async function reviewWriteOff(approved: boolean): Promise<void> {
    const request = pendingRequest.value;
    if (!request) {
      return;
    }

    await execute(
      () => ({
        type: CommandType.ReviewWriteOff,
        requestId: request.id,
        approved,
        reason: reviewReason.value,
      }),
      approved ? 'Write-off approved.' : 'Write-off rejected.',
    );
  }
</script>

<template>
  <Modal
    :title="`${invoice?.number ?? 'Invoice'} corrections`"
    subtitle="Internal receivables records; tax documents are issued in your billing system."
    wide
    @close="!saving && emit('close')"
  >
    <p v-if="invoice">
      Current amount:
      <strong>{{ formatMoney(invoice.amount) }}</strong>
      · Outstanding:
      <strong>{{ formatMoney(balance(invoice)) }}</strong>
    </p>

    <p
      v-if="error"
      class="form-error"
      role="alert"
    >
      {{ error }}
    </p>

    <div
      v-if="canCorrect && invoice"
      class="correction-grid"
    >
      <form @submit.prevent="submitAdjustment">
        <h3>Correct an amount</h3>
        <label>
          Direction
          <select v-model="direction">
            <option :value="InvoiceAdjustmentDirection.Decrease">Decrease</option>
            <option :value="InvoiceAdjustmentDirection.Increase">Increase</option>
          </select>
        </label>
        <label>
          Amount in PKR
          <input
            v-model="adjustmentAmount"
            type="number"
            step="0.01"
            min="0.01"
            required
          />
        </label>
        <label>
          Reason
          <textarea
            v-model="adjustmentReason"
            minlength="5"
            required
          ></textarea>
        </label>
        <button
          class="button small"
          :disabled="saving"
        >
          Record adjustment
        </button>
      </form>

      <form @submit.prevent="submitCreditNote">
        <h3>Internal credit note</h3>
        <label>
          Credit note number
          <input
            v-model="creditNoteNumber"
            maxlength="100"
            required
          />
        </label>
        <label>
          Amount in PKR
          <input
            v-model="creditNoteAmount"
            type="number"
            step="0.01"
            min="0.01"
            required
          />
        </label>
        <label>
          Reason
          <textarea
            v-model="creditNoteReason"
            minlength="5"
            required
          ></textarea>
        </label>
        <button
          class="button small"
          :disabled="saving"
        >
          Record credit note
        </button>
      </form>
    </div>

    <section v-if="invoice">
      <h3>Write-off approval</h3>
      <p v-if="pendingRequest">
        {{ pendingRequest.requestedBy }} requested a write-off of
        {{ formatMoney(pendingRequest.amount) }}. {{ pendingRequest.reason }}
      </p>
      <form
        v-if="canCorrect && !pendingRequest && balance(invoice) > 0"
        @submit.prevent="requestWriteOff"
      >
        <label>
          Reason for requesting a write-off
          <textarea
            v-model="writeOffReason"
            minlength="5"
            required
          ></textarea>
        </label>
        <button
          class="button small"
          :disabled="saving"
        >
          Request approval
        </button>
      </form>
      <div v-if="canReview && pendingRequest && pendingRequest.requestedById !== session.user.id">
        <label>
          Review reason
          <textarea
            v-model="reviewReason"
            minlength="5"
            required
          ></textarea>
        </label>
        <div class="review-actions">
          <button
            type="button"
            class="button small"
            :disabled="saving || reviewReason.trim().length < 5"
            @click="reviewWriteOff(true)"
          >
            Approve write-off
          </button>
          <button
            type="button"
            class="button small"
            :disabled="saving || reviewReason.trim().length < 5"
            @click="reviewWriteOff(false)"
          >
            Reject
          </button>
        </div>
      </div>
    </section>

    <section>
      <h3>Correction history</h3>
      <p v-if="!corrections.length && !requests.length">No corrections recorded.</p>
      <div
        v-for="correction in corrections"
        :key="correction.id"
        class="history-item"
      >
        <strong>{{ correction.kind }} {{ correction.number }}</strong>
        <span>
          {{ correction.direction }} {{ formatMoney(correction.amount) }} ·
          {{ correction.createdBy }} · {{ correction.createdAt.slice(0, 10) }}
        </span>
        <p>{{ correction.reason }}</p>
      </div>
      <div
        v-for="request in requests"
        :key="request.id"
        class="history-item"
      >
        <strong>Write-off {{ request.status }}</strong>
        <span>{{ formatMoney(request.amount) }} · {{ request.requestedBy }}</span>
        <p>{{ request.reason }}</p>
        <p v-if="request.reviewedBy">{{ request.reviewedBy }}: {{ request.reviewReason }}</p>
      </div>
    </section>
  </Modal>
</template>

<style scoped>
  .correction-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1.5rem;
    margin-block: 1.5rem;
  }

  form,
  section {
    display: grid;
    gap: 0.75rem;
    margin-block: 1rem;
  }

  label {
    display: grid;
    gap: 0.35rem;
  }

  .review-actions {
    display: flex;
    gap: 0.75rem;
  }

  .history-item {
    border-top: 1px solid var(--border, #dce3ee);
    padding-block: 0.75rem;
  }
</style>
