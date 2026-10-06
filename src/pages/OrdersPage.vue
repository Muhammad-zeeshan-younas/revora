<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { z } from 'zod';
  import { OrderStatus, Role } from '../../shared/enums';
  import { account, formatMoney, toPaisa } from '../../shared/finance';
  import type { Workspace } from '../../shared/schema';
  import { notify } from '../composables/useNotifications';
  import { request } from '../lib/http-client';
  import { loadWorkspace, snapshot } from '../stores/workspace';

  const inventoryItemSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    sku: z.string(),
    name: z.string(),
    unitPrice: z.number(),
    onHand: z.number(),
    reserved: z.number(),
  });
  const orderLineSchema = z.object({
    organizationId: z.string(),
    orderId: z.string(),
    itemId: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
  });
  const orderSchema = z.object({
    organizationId: z.string(),
    id: z.string(),
    sortOrder: z.number(),
    number: z.string(),
    customerId: z.string(),
    status: z.enum(OrderStatus),
    amount: z.number(),
    createdAt: z.string(),
    createdBy: z.string(),
    invoiceId: z.string(),
    lines: z.array(orderLineSchema),
  });
  const inventoryPageSchema = z.object({
    items: z.array(inventoryItemSchema),
    nextCursor: z.string().nullable(),
  });
  const orderPageSchema = z.object({
    items: z.array(orderSchema),
    nextCursor: z.number().nullable(),
    revision: z.number(),
  });
  const mutationResultSchema = z.object({ revision: z.number() });
  const pendingStockChangeSchema = z.object({ delta: z.number().int(), requestId: z.uuid() });
  const PENDING_STOCK_CHANGE_PREFIX = 'revora:pending-stock-change';

  const props = defineProps<{ workspace: Workspace }>();
  const inventory = ref<z.infer<typeof inventoryItemSchema>[]>([]);
  const orders = ref<z.infer<typeof orderSchema>[]>([]);
  const inventoryCursor = ref<string | null>(null);
  const orderCursor = ref<number | null>(null);
  const loadedInventory = ref(false);
  const loadedOrders = ref(false);
  const heldCredit = ref<Record<string, number>>({});
  const busy = ref(false);
  const error = ref('');
  const sku = ref('');
  const itemName = ref('');
  const unitPrice = ref('');
  const onHand = ref(0);
  const stockDeltas = ref<Record<string, number>>({});
  const orderNumber = ref('');
  const customerId = ref('');
  const lines = ref<{ itemId: string; quantity: number }[]>([{ itemId: '', quantity: 1 }]);
  const invoiceNumbers = ref<Record<string, string>>({});
  const role = computed(() => snapshot.value?.session.user.role ?? Role.Viewer);
  const canManageStock = computed(() =>
    [Role.Owner, Role.Admin, Role.Accountant].includes(role.value),
  );
  const canPlaceOrders = computed(() =>
    [Role.Owner, Role.Admin, Role.Accountant, Role.Sales].includes(role.value),
  );
  const customer = computed(() =>
    props.workspace.customers.find((row) => row.id === customerId.value),
  );
  const availableCredit = computed(() =>
    customer.value
      ? account(props.workspace, customer.value.id).available -
        (heldCredit.value[customer.value.id] ?? 0)
      : 0,
  );
  const orderTotal = computed(() =>
    lines.value.reduce((sum, line) => {
      const item = inventory.value.find((row) => row.id === line.itemId);

      return sum + (item?.unitPrice ?? 0) * (Number(line.quantity) || 0);
    }, 0),
  );

  async function loadInventory(reset = false): Promise<void> {
    const cursor = reset ? null : inventoryCursor.value;
    const path = `/workspace/inventory${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page = await request(path, inventoryPageSchema);
    inventory.value = reset ? page.items : [...inventory.value, ...page.items];
    inventoryCursor.value = page.nextCursor;
    for (const item of page.items) {
      const storageKey = `${PENDING_STOCK_CHANGE_PREFIX}:${snapshot.value?.session.organizationId}:${snapshot.value?.session.user.id}:${item.id}`;
      try {
        const raw = sessionStorage.getItem(storageKey);
        const parsed = raw ? pendingStockChangeSchema.safeParse(JSON.parse(raw)) : null;
        if (parsed?.success) {stockDeltas.value[item.id] = parsed.data.delta;}
      } catch {
        // A malformed browser entry is handled if the operator retries the adjustment.
      }
    }
    loadedInventory.value = true;
  }

  async function loadOrders(reset = false): Promise<void> {
    const cursor = reset ? null : orderCursor.value;
    const path = `/workspace/orders${cursor !== null ? `?cursor=${cursor}` : ''}`;
    const page = await request(path, orderPageSchema);
    orders.value = reset ? page.items : [...orders.value, ...page.items];
    orderCursor.value = page.nextCursor;
    loadedOrders.value = true;
  }

  async function loadHolds(): Promise<void> {
    heldCredit.value = await request('/workspace/orders/holds', z.record(z.string(), z.number()));
  }

  async function refresh(): Promise<void> {
    try {
      await Promise.all([loadInventory(true), loadOrders(true), loadHolds()]);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not load orders and stock.';
    }
  }

  async function perform(operation: () => Promise<unknown>, message: string): Promise<void> {
    busy.value = true;
    error.value = '';
    try {
      await operation();
      await Promise.all([refresh(), loadWorkspace()]);
      notify(message);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Order action failed.';
    } finally {
      busy.value = false;
    }
  }

  async function createItem(): Promise<void> {
    let amount: number;
    try {
      amount = toPaisa(unitPrice.value);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Enter a valid unit price.';

      return;
    }
    await perform(async () => {
      await request(
        '/workspace/inventory',
        z.object({ item: inventoryItemSchema, revision: z.number() }),
        {
          sku: sku.value,
          name: itemName.value,
          unitPrice: amount,
          onHand: Number(onHand.value),
        },
      );
      sku.value = '';
      itemName.value = '';
      unitPrice.value = '';
      onHand.value = 0;
    }, 'Stock item created.');
  }

  async function adjustStock(itemId: string): Promise<void> {
    const delta = Number(stockDeltas.value[itemId] ?? 0);
    if (!Number.isInteger(delta) || delta === 0) {
      error.value = 'Enter a nonzero whole-number stock adjustment.';

      return;
    }
    const storageKey = `${PENDING_STOCK_CHANGE_PREFIX}:${snapshot.value?.session.organizationId}:${snapshot.value?.session.user.id}:${itemId}`;
    const pendingRaw = sessionStorage.getItem(storageKey);
    let pending: ReturnType<typeof pendingStockChangeSchema.safeParse> | null = null;
    try {
      pending = pendingRaw ? pendingStockChangeSchema.safeParse(JSON.parse(pendingRaw)) : null;
    } catch {
      pending = null;
    }
    if (pendingRaw && !pending?.success) {
      error.value =
        'A pending stock adjustment could not be read. Review stock before trying again.';

      return;
    }
    if (pending?.success && pending.data.delta !== delta) {
      error.value = `Retry the pending adjustment of ${pending.data.delta} units before changing the amount.`;

      return;
    }
    const requestId = pending?.success ? pending.data.requestId : crypto.randomUUID();
    if (!pendingRaw) {sessionStorage.setItem(storageKey, JSON.stringify({ delta, requestId }));}
    await perform(async () => {
      await request(
        `/workspace/inventory/${encodeURIComponent(itemId)}/adjust`,
        z.object({ item: inventoryItemSchema, revision: z.number() }),
        { delta, requestId },
      );
      sessionStorage.removeItem(storageKey);
      stockDeltas.value[itemId] = 0;
    }, 'Stock quantity updated.');
  }

  async function reserve(): Promise<void> {
    await perform(async () => {
      await request(
        '/workspace/orders',
        z.object({ order: orderSchema.omit({ lines: true }), revision: z.number() }),
        {
          number: orderNumber.value,
          customerId: customerId.value,
          lines: lines.value.map((line) => ({
            itemId: line.itemId,
            quantity: Number(line.quantity),
          })),
        },
      );
      orderNumber.value = '';
      lines.value = [{ itemId: '', quantity: 1 }];
    }, 'Order reserved against stock and credit.');
  }

  async function cancel(orderId: string): Promise<void> {
    await perform(
      () =>
        request(
          `/workspace/orders/${encodeURIComponent(orderId)}/cancel`,
          mutationResultSchema,
          {},
        ),
      'Order cancelled. Stock and credit released.',
    );
  }

  async function fulfill(orderId: string): Promise<void> {
    await perform(async () => {
      await request(
        `/workspace/orders/${encodeURIComponent(orderId)}/fulfill`,
        z.object({ invoiceId: z.string(), revision: z.number() }),
        {
          invoiceNumber: invoiceNumbers.value[orderId] ?? '',
        },
      );
      invoiceNumbers.value[orderId] = '';
    }, 'Order fulfilled and receivable invoice recorded.');
  }

  function itemLabel(itemId: string): string {
    const item = inventory.value.find((row) => row.id === itemId);

    return item ? `${item.sku} × ${item.name}` : itemId;
  }

  function customerName(id: string): string {
    return props.workspace.customers.find((row) => row.id === id)?.name ?? id;
  }

  onMounted(() => void refresh());
</script>

<template>
  <div class="orders-layout">
    <section class="panel orders-panel">
      <h2>Reserve an order</h2>
      <p>Stock and customer credit are held together until the order is cancelled or fulfilled.</p>
      <form
        v-if="canPlaceOrders"
        class="order-form"
        @submit.prevent="reserve"
      >
        <label>
          Order number
          <input
            v-model="orderNumber"
            required
            maxlength="60"
          />
        </label>
        <label>
          Customer
          <select
            v-model="customerId"
            required
          >
            <option value="">Choose customer</option>
            <option
              v-for="row in workspace.customers"
              :key="row.id"
              :value="row.id"
            >
              {{ row.name }}
            </option>
          </select>
        </label>
        <p v-if="customer">
          Available credit after existing holds: {{ formatMoney(availableCredit) }}
        </p>
        <div
          v-for="(line, index) in lines"
          :key="index"
          class="order-line"
        >
          <select
            v-model="line.itemId"
            required
            aria-label="Stock item"
          >
            <option value="">Choose stock item</option>
            <option
              v-for="item in inventory"
              :key="item.id"
              :value="item.id"
            >
              {{ item.sku }} · {{ item.name }} · {{ item.onHand - item.reserved }} available
            </option>
          </select>
          <input
            v-model.number="line.quantity"
            type="number"
            min="1"
            step="1"
            required
            aria-label="Quantity"
          />
          <button
            v-if="lines.length > 1"
            type="button"
            class="button small"
            @click="lines.splice(index, 1)"
          >
            Remove
          </button>
        </div>
        <button
          type="button"
          class="button small"
          :disabled="lines.length >= 20"
          @click="lines.push({ itemId: '', quantity: 1 })"
        >
          Add line
        </button>
        <strong>Order total: {{ formatMoney(orderTotal) }}</strong>
        <button
          class="button primary"
          :disabled="busy || !customerId || orderTotal <= 0"
        >
          Reserve stock and credit
        </button>
      </form>
      <p v-else>Your role can view orders and stock.</p>
    </section>
    <section
      v-if="canManageStock"
      class="panel orders-panel"
    >
      <h2>Add stock item</h2>
      <form
        class="order-form"
        @submit.prevent="createItem"
      >
        <label>
          SKU
          <input
            v-model="sku"
            required
            maxlength="40"
            placeholder="SKU-100"
          />
        </label>
        <label>
          Item name
          <input
            v-model="itemName"
            required
            maxlength="120"
          />
        </label>
        <label>
          Unit price (PKR)
          <input
            v-model="unitPrice"
            required
            inputmode="decimal"
          />
        </label>
        <label>
          Opening units
          <input
            v-model.number="onHand"
            type="number"
            min="0"
            step="1"
            required
          />
        </label>
        <button
          class="button primary"
          :disabled="busy"
        >
          Add item
        </button>
      </form>
    </section>
  </div>
  <p
    v-if="error"
    role="alert"
    class="error-banner"
  >
    {{ error }}
  </p>
  <section class="panel orders-panel">
    <h2>Inventory</h2>
    <p v-if="loadedInventory && !inventory.length">Add a stock item to start taking orders.</p>
    <div class="order-table">
      <table v-if="inventory.length">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Item</th>
            <th>Price</th>
            <th>On hand</th>
            <th>Reserved</th>
            <th>Available</th>
            <th v-if="canManageStock">Adjustment</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in inventory"
            :key="item.id"
          >
            <td>{{ item.sku }}</td>
            <td>{{ item.name }}</td>
            <td>{{ formatMoney(item.unitPrice) }}</td>
            <td>{{ item.onHand }}</td>
            <td>{{ item.reserved }}</td>
            <td>{{ item.onHand - item.reserved }}</td>
            <td v-if="canManageStock">
              <input
                v-model.number="stockDeltas[item.id]"
                type="number"
                step="1"
                aria-label="Stock adjustment"
              />
              <button
                class="button small"
                :disabled="busy || !stockDeltas[item.id]"
                @click="adjustStock(item.id)"
              >
                Apply
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button
      v-if="inventoryCursor"
      class="button small"
      @click="loadInventory()"
    >
      Load more stock
    </button>
  </section>
  <section class="panel orders-panel">
    <h2>Orders</h2>
    <p v-if="loadedOrders && !orders.length">No orders yet.</p>
    <div
      v-for="order in orders"
      :key="order.id"
      class="order-card"
    >
      <div class="order-card-heading">
        <strong>{{ order.number }} · {{ customerName(order.customerId) }}</strong>
        <span>{{ order.status }}</span>
      </div>
      <p>
        {{ order.lines.map((line) => `${itemLabel(line.itemId)} × ${line.quantity}`).join(', ') }}
      </p>
      <p>
        {{ formatMoney(order.amount) }} · {{ order.createdAt.slice(0, 10) }}
        <span v-if="order.invoiceId">· Invoice recorded</span>
      </p>
      <div
        v-if="order.status === OrderStatus.Reserved"
        class="order-actions"
      >
        <button
          v-if="canPlaceOrders"
          class="button small"
          :disabled="busy"
          @click="cancel(order.id)"
        >
          Cancel and release
        </button>
        <template v-if="canManageStock">
          <input
            v-model="invoiceNumbers[order.id]"
            placeholder="Invoice number"
            aria-label="Invoice number"
          />
          <button
            class="button primary small"
            :disabled="busy || !invoiceNumbers[order.id]"
            @click="fulfill(order.id)"
          >
            Fulfill and invoice
          </button>
        </template>
      </div>
    </div>
    <button
      v-if="orderCursor !== null"
      class="button small"
      @click="loadOrders()"
    >
      Load more orders
    </button>
  </section>
</template>

<style scoped>
  .orders-layout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: 1rem;
  }
  .orders-panel {
    padding: 1.25rem;
    margin-bottom: 1rem;
  }
  .orders-panel h2 {
    margin: 0 0 0.5rem;
  }
  .order-form,
  .order-form label {
    display: grid;
    gap: 0.6rem;
  }
  .order-form {
    margin-top: 1rem;
  }
  .order-line,
  .order-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .order-line select {
    flex: 1;
  }
  .order-line input {
    width: 6rem;
  }
  .order-table {
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 0.6rem;
    border-bottom: 1px solid #e5e7eb;
  }
  td input {
    width: 5rem;
    margin-right: 0.5rem;
  }
  .order-card {
    padding: 0.9rem 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .order-card-heading {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .order-card p {
    margin: 0.4rem 0;
  }
</style>
