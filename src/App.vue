<script setup lang="ts">
  import { ImportKind } from '../shared/enums';

  import { PageId, ActionKind } from './config/ui.enums';

  import { navigation, pageMetadata } from './config/navigation';
  import { PaymentStatus, PromiseStatus } from '../shared/enums';

  import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
  import { onClickOutside } from '@vueuse/core';
  import { z } from 'zod';
  import { request } from './lib/http-client';
  import { download } from './lib/download';
  import { toast, notify } from './composables/useNotifications';
  import { loadWorkspace, loading, loadError, snapshot } from './stores/workspace';
  import { csvExport } from '../shared/csv';
  import { balance, invoiceStatus, today } from '../shared/finance';
  import type { Action, Page } from './types';
  import Icon from './components/ui/UiIcon.vue';
  import AuthScreen from './components/AuthScreen.vue';
  import Skeleton from './components/ui/LoadingSkeleton.vue';
  import Dashboard from './pages/OverviewPage.vue';
  import RecordsPage from './pages/RecordsPage.vue';
  import CollectionsPage from './pages/CollectionsPage.vue';
  import SettingsPage from './pages/SettingsPage.vue';
  import ActionDialog from './components/ActionDialog.vue';
  import ProfileDialog from './components/ProfileDialog.vue';

  const page = ref<Page>(PageId.Overview);
  const mobileOpen = ref(false);
  const action = ref<Action | null>(null);
  const search = ref('');
  const searchOpen = ref(false);
  const notificationsOpen = ref(false);
  const accountMenuOpen = ref(false);
  const accountMenu = ref<HTMLElement | null>(null);
  const accountButton = ref<HTMLButtonElement | null>(null);
  onClickOutside(accountMenu, () => {
    accountMenuOpen.value = false;
  });
  const initialized = ref(false);
  const title = computed(() =>
    page.value === PageId.Settings
      ? 'Settings'
      : (navigation.find((item) => item.page === page.value)?.label ?? 'Overview'),
  );
  const currentDate = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  }).format(new Date());
  const unmatched = computed(
    () =>
      snapshot.value?.workspace.payments.filter((payment) =>
        [PaymentStatus.Unmatched, PaymentStatus.Partial].includes(payment.status),
      ).length ?? 0,
  );
  const searchResults = computed(() => {
    if (!snapshot.value || search.value.length < 2) {
      return [];
    }

    return snapshot.value.workspace.customers
      .filter((customer) =>
        `${customer.name} ${customer.contact} ${customer.city}`
          .toLowerCase()
          .includes(search.value.toLowerCase()),
      )
      .slice(0, 5);
  });

  function navigate(next: Page): void {
    page.value = next;
    location.hash = next;
    mobileOpen.value = false;
    notificationsOpen.value = false;
    accountMenuOpen.value = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function readHash(): void {
    const hash = location.hash.slice(1);
    page.value = Object.values(PageId).find((candidate) => candidate === hash) ?? PageId.Overview;
  }

  function keyboard(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (accountMenuOpen.value) {
        accountMenuOpen.value = false;
        accountButton.value?.focus();
      }
      searchOpen.value = false;
      notificationsOpen.value = false;
      mobileOpen.value = false;
    }
  }

  function toggleAccountMenu(): void {
    accountMenuOpen.value = !accountMenuOpen.value;
    notificationsOpen.value = false;
    searchOpen.value = false;
  }

  function closeAccountMenuOnBlur(event: FocusEvent): void {
    if (
      !(event.relatedTarget instanceof Node) ||
      !accountMenu.value?.contains(event.relatedTarget)
    ) {
      accountMenuOpen.value = false;
    }
  }
  onMounted(async () => {
    readHash();
    window.addEventListener('hashchange', readHash);
    window.addEventListener('keydown', keyboard);
    await loadWorkspace();
    initialized.value = true;
  });
  onBeforeUnmount(() => {
    window.removeEventListener('hashchange', readHash);
    window.removeEventListener('keydown', keyboard);
  });

  async function logout(): Promise<void> {
    accountMenuOpen.value = false;
    try {
      await request('/auth/logout', z.object({ ok: z.boolean() }), {});
      snapshot.value = null;
      action.value = null;
      navigate(PageId.Overview);
    } catch {
      notify('Unable to sign out. Please retry.');
    }
  }

  function exportReport(): void {
    if (!snapshot.value) {
      return;
    }
    const workspace = snapshot.value.workspace;
    download(
      `revora-receivables-${today()}.csv`,
      csvExport(
        [
          'Invoice',
          'Customer',
          'Issued',
          'Due',
          'Amount PKR',
          'Paid PKR',
          'Outstanding PKR',
          'Status',
        ],
        workspace.invoices.map((invoice) => [
          invoice.number,
          workspace.customers.find((customer) => customer.id === invoice.customerId)?.name ?? '',
          invoice.issuedAt,
          invoice.dueAt,
          String(invoice.amount / 100),
          String(invoice.paid / 100),
          String(balance(invoice) / 100),
          invoiceStatus(invoice),
        ]),
      ),
    );
    notify('Receivables report exported.');
  }
</script>
<template>
  <div
    v-if="!initialized"
    class="startup"
  >
    <span class="brand-mark">
      r
      <span>↗</span>
    </span>
    <p>Bringing your workspace into focus…</p>
    <Icon
      name="spinner"
      class="spin"
    />
  </div>
  <AuthScreen v-else-if="!snapshot && !loadError" />
  <div
    v-else-if="!snapshot"
    class="startup"
  >
    <Icon
      name="warning"
      :size="40"
    />
    <h2>We couldn’t reach your workspace.</h2>
    <p>{{ loadError }}</p>
    <button
      class="button primary"
      @click="loadWorkspace"
    >
      Try again
    </button>
  </div>
  <div
    v-else
    class="app-shell"
  >
    <a
      href="#main"
      class="skip-link"
    >
      Skip to content
    </a>
    <div
      v-if="mobileOpen"
      class="sidebar-overlay"
      @click="mobileOpen = false"
    ></div>
    <aside :class="['sidebar', { open: mobileOpen }]">
      <a
        href="#overview"
        class="brand"
        @click.prevent="navigate(PageId.Overview)"
      >
        <span class="brand-mark">
          r
          <span>↗</span>
        </span>
        revora
        <span class="brand-period">.</span>
      </a>
      <button
        class="workspace-switch"
        @click="navigate(PageId.Settings)"
      >
        <span class="workspace-avatar">
          <Icon
            name="building"
            :size="19"
          />
        </span>
        <span>
          <strong>{{ snapshot.workspace.organization.name }}</strong>
          <small>{{ snapshot.session.demo ? 'Demo workspace' : 'Business workspace' }}</small>
        </span>
        <Icon
          name="down"
          :size="14"
        />
      </button>
      <nav aria-label="Main navigation">
        <template
          v-for="(item, index) in navigation"
          :key="item.page"
        >
          <p
            v-if="index === 0 || navigation[index - 1]?.group !== item.group"
            class="nav-label"
          >
            {{ item.group }}
          </p>
          <button
            :class="['nav-item', { active: page === item.page }]"
            :aria-current="page === item.page ? 'page' : undefined"
            @click="navigate(item.page)"
          >
            <Icon
              :name="item.icon"
              :weight="page === item.page ? 'fill' : 'regular'"
            />
            <span>{{ item.label }}</span>
            <span
              v-if="item.page === PageId.Payments && unmatched"
              class="nav-count"
            >
              {{ unmatched }}
            </span>
            <span
              v-if="item.page === PageId.Activity"
              class="new-dot"
            ></span>
          </button>
        </template>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-note">
          <span class="note-orbit">
            <Icon
              name="sparkle"
              :size="20"
            />
          </span>
          <strong>
            A little less chasing.
            <br />
            A lot more growing.
          </strong>
          <p>Let your receivables work for you.</p>
          <button @click="navigate(PageId.Collections)">
            Open collections
            <Icon
              name="arrow"
              :size="15"
            />
          </button>
        </div>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div class="breadcrumb">
          <button
            class="icon-button mobile-menu"
            aria-label="Open navigation"
            @click="mobileOpen = true"
          >
            <Icon name="menu" />
          </button>
          <Icon
            name="building"
            :size="17"
          />
          <span>Workspace</span>
          <span class="breadcrumb-slash">/</span>
          <strong>{{ title }}</strong>
        </div>
        <div class="topbar-actions">
          <div class="global-search">
            <Icon
              name="search"
              :size="18"
            />
            <input
              v-model="search"
              aria-label="Search customers"
              placeholder="Search customers…"
              @focus="searchOpen = true"
            />
            <kbd>/</kbd>
            <div
              v-if="searchOpen && search.length > 1"
              class="search-popover"
            >
              <span class="eyebrow">CUSTOMERS</span>
              <button
                v-for="customer in searchResults"
                :key="customer.id"
                @click="
                  action = { kind: ActionKind.Profile, customerId: customer.id };
                  searchOpen = false;
                  search = '';
                "
              >
                <span class="avatar">{{ customer.name.slice(0, 2).toUpperCase() }}</span>
                <span>
                  {{ customer.name }}
                  <small>{{ customer.city }}</small>
                </span>
                <Icon name="right" />
              </button>
              <p v-if="!searchResults.length">No customers found.</p>
            </div>
          </div>
          <span
            v-if="snapshot.session.demo"
            class="demo-label"
          >
            Demo data
          </span>
          <div class="notification-wrap">
            <button
              class="icon-button notification-button"
              aria-label="Notifications"
              :aria-expanded="notificationsOpen"
              @click="notificationsOpen = !notificationsOpen"
            >
              <Icon name="bell" />
              <i v-if="unmatched"></i>
            </button>
            <div
              v-if="notificationsOpen"
              class="notification-popover"
            >
              <h3>Your attention, where it matters.</h3>
              <button @click="navigate(PageId.Payments)">
                <Icon name="payments" />
                <span>
                  <strong>{{ unmatched }} payments to review</strong>
                  <small>Match incoming funds to open invoices.</small>
                </span>
                <Icon name="right" />
              </button>
              <button @click="navigate(PageId.Collections)">
                <Icon name="clock" />
                <span>
                  <strong>
                    {{
                      snapshot.workspace.promises.filter((p) => p.status === PromiseStatus.Broken)
                        .length
                    }}
                    broken promises
                  </strong>
                  <small>Check your collection queue.</small>
                </span>
                <Icon name="right" />
              </button>
            </div>
          </div>
          <span class="topbar-divider"></span>
          <div
            ref="accountMenu"
            class="account-menu"
            @focusout="closeAccountMenuOnBlur"
          >
            <button
              ref="accountButton"
              class="account-button"
              aria-label="Account options"
              :aria-expanded="accountMenuOpen"
              aria-controls="account-options"
              @click="toggleAccountMenu"
            >
              <span class="avatar small-avatar">{{ snapshot.session.user.name.slice(0, 1) }}</span>
              <Icon
                name="down"
                :size="12"
              />
            </button>
            <div
              v-if="accountMenuOpen"
              id="account-options"
              class="account-popover"
            >
              <div class="account-identity">
                <strong>{{ snapshot.session.user.name }}</strong>
                <small>{{ snapshot.session.user.role }}</small>
              </div>
              <nav aria-label="Account navigation">
                <button
                  :aria-current="page === PageId.Settings ? 'page' : undefined"
                  @click="navigate(PageId.Settings)"
                >
                  <Icon
                    name="settings"
                    :size="18"
                  />
                  Settings
                </button>
                <button
                  @click="
                    accountMenuOpen = false;
                    action = { kind: ActionKind.Help };
                  "
                >
                  <Icon
                    name="help"
                    :size="18"
                  />
                  Help & getting started
                </button>
                <button
                  class="account-logout"
                  @click="logout"
                >
                  <Icon
                    name="logout"
                    :size="18"
                  />
                  Sign out
                </button>
              </nav>
            </div>
          </div>
        </div>
      </header>
      <main
        id="main"
        class="main-content"
      >
        <div
          v-if="loadError"
          class="error-banner"
          role="alert"
        >
          {{ loadError }}
          <button
            class="text-button"
            @click="loadWorkspace"
          >
            Retry
          </button>
        </div>
        <Skeleton v-if="loading" />
        <template v-else>
          <div class="page-heading">
            <div>
              <div class="page-eyebrow">
                <span class="status-dot"></span>
                {{
                  page === PageId.Overview ? 'LET’S MAKE TODAY COUNT' : 'YOUR BUSINESS, IN FOCUS'
                }}
              </div>
              <h1>{{ pageMetadata[page].title }}</h1>
              <p>{{ pageMetadata[page].description }}</p>
            </div>
            <div class="heading-actions">
              <button
                v-if="page === PageId.Overview"
                class="button"
                @click="exportReport"
              >
                <Icon
                  name="download"
                  :size="17"
                />
                Export report
              </button>
              <button
                v-if="[PageId.Overview, PageId.Invoices].includes(page)"
                class="button primary"
                @click="action = { kind: ActionKind.Invoice }"
              >
                <Icon
                  name="plus"
                  :size="18"
                />
                New invoice
              </button>
              <button
                v-else-if="page === PageId.Customers"
                class="button primary"
                @click="action = { kind: ActionKind.Customer }"
              >
                <Icon
                  name="plus"
                  :size="18"
                />
                Add customer
              </button>
              <button
                v-else-if="page === PageId.Payments"
                class="button primary"
                @click="action = { kind: ActionKind.Import, importKind: ImportKind.Payments }"
              >
                <Icon
                  name="upload"
                  :size="18"
                />
                Import statement
              </button>
              <span
                v-else
                class="date-pill"
              >
                <Icon
                  name="calendar"
                  :size="17"
                />
                {{ currentDate }}
              </span>
            </div>
          </div>
          <Dashboard
            v-if="page === PageId.Overview"
            :workspace="snapshot.workspace"
            @navigate="navigate"
            @action="action = $event"
          />
          <CollectionsPage
            v-else-if="page === PageId.Collections"
            :workspace="snapshot.workspace"
            @action="action = $event"
          />
          <SettingsPage
            v-else-if="page === PageId.Settings"
            :workspace="snapshot.workspace"
            @action="action = $event"
          />
          <RecordsPage
            v-else
            :key="page"
            :page="page"
            :workspace="snapshot.workspace"
            @action="action = $event"
          />
          <footer class="content-footer">
            <span>
              <span class="status-dot"></span>
              All figures in Pakistani Rupees (PKR)
            </span>
            <span>
              Thoughtfully built for better business.
              <span class="footer-brand">revora.</span>
            </span>
          </footer>
        </template>
      </main>
    </div>
    <ProfileDialog
      v-if="action?.kind === ActionKind.Profile"
      :customer-id="action.customerId"
      :workspace="snapshot.workspace"
      @close="action = null"
      @action="action = $event"
    />
    <ActionDialog
      v-else-if="action"
      :action="action"
      :workspace="snapshot.workspace"
      @close="action = null"
    />
  </div>
  <Transition name="toast">
    <div
      v-if="toast"
      class="toast"
      role="status"
    >
      <Icon
        name="checkCircle"
        :size="20"
      />
      {{ toast }}
      <button
        aria-label="Dismiss notification"
        @click="toast = ''"
      >
        <Icon
          name="close"
          :size="16"
        />
      </button>
    </div>
  </Transition>
</template>

<style scoped lang="scss" src="./App.scss"></style>
