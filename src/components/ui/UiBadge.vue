<script setup lang="ts">
  import {
    CollectionPriority,
    CustomerStatus,
    InvoiceStatus,
    PaymentStatus,
    PromiseStatus,
    ReminderStatus,
  } from '../../../shared/enums';

  import { computed } from 'vue';

  const props = defineProps<{ label: string }>();

  type BadgeTone = 'green' | 'red' | 'amber' | 'neutral';

  const statusTones = new Map<string, BadgeTone>([
    [InvoiceStatus.Paid, 'green'],
    [PaymentStatus.Matched, 'green'],
    [PromiseStatus.Kept, 'green'],
    [CustomerStatus.Active, 'green'],
    [CollectionPriority.Normal, 'green'],
    [ReminderStatus.Prepared, 'green'],
    [InvoiceStatus.Overdue, 'red'],
    [CollectionPriority.Critical, 'red'],
    [PromiseStatus.Broken, 'red'],
    [InvoiceStatus.Disputed, 'red'],
    [CustomerStatus.OnHold, 'red'],
    [PaymentStatus.Reversed, 'red'],
    [CollectionPriority.High, 'amber'],
    [PromiseStatus.Pending, 'amber'],
    [PaymentStatus.Partial, 'amber'],
    [InvoiceStatus.PartiallyPaid, 'amber'],
    [PromiseStatus.PartiallyKept, 'amber'],
    [PaymentStatus.Unmatched, 'amber'],
    [ReminderStatus.Queued, 'amber'],
  ]);

  const tone = computed(() => statusTones.get(props.label) ?? 'neutral');
</script>
<template>
  <span :class="['badge', tone]">
    <span class="badge-dot"></span>
    {{ label }}
  </span>
</template>

<style scoped lang="scss">
  @use '../../styles/tokens' as *;

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 550;
    border-radius: 5px;
    white-space: nowrap;
    line-height: 1.3;
    &.green {
      background: $success-soft;
      color: $success;
    }
    &.amber {
      background: $warning-soft;
      color: $warning;
    }
    &.red {
      background: $danger-soft;
      color: $danger;
    }
    &.neutral {
      background: $surface-soft;
      color: $muted;
    }
  }

  .badge-dot {
    width: 4px;
    height: 4px;
    background: currentColor;
    border-radius: 50%;
  }
</style>
