<script setup lang="ts">
  import { ImportKind } from '../shared/enums';

  import { PageId, ActionKind } from './config/ui.enums';

  import { navigation, pageMetadata } from './config/navigation';
  import { PaymentStatus, PromiseStatus } from '../shared/enums';

  import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
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
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function readHash(): void {
    const hash = location.hash.slice(1);
    page.value = Object.values(PageId).find((candidate) => candidate === hash) ?? PageId.Overview;
  }

  function keyboard(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      searchOpen.value = false;
      notificationsOpen.value = false;
      mobileOpen.value = false;
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
        <button
          :class="['nav-item', { active: page === PageId.Settings }]"
          @click="navigate(PageId.Settings)"
        >
          <Icon name="settings" />
          <span>Settings</span>
        </button>
        <button
          class="nav-item"
          @click="action = { kind: ActionKind.Help }"
        >
          <Icon name="help" />
          <span>Help & getting started</span>
          <Icon
            name="upRight"
            :size="16"
          />
        </button>
        <div class="user-card">
          <span class="avatar user-avatar">
            {{
              snapshot.session.user.name
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')
            }}
          </span>
          <span>
            <strong>{{ snapshot.session.user.name }}</strong>
            <small>{{ snapshot.session.user.role }}</small>
          </span>
          <button
            class="icon-button"
            aria-label="Sign out"
            @click="logout"
          >
            <Icon
              name="logout"
              :size="19"
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
          <span class="avatar small-avatar">{{ snapshot.session.user.name.slice(0, 1) }}</span>
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

<style scoped lang="scss">
  @use './styles/tokens' as *;

  .app-shell {
    min-height: 100vh;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: 225px;
    background: $navy;
    color: $on-dark;
    border-right: 1px solid #243956;
    padding: 32px 17px 0;
    display: flex;
    flex-direction: column;
    z-index: 30;
    overflow-y: auto;
    .brand {
      margin-left: 14px;
      margin-bottom: 33px;
      color: white;
    }
    .workspace-switch,
    .sidebar-note {
      background: #1c304e;
      border-color: #324765;
      color: white;
    }
    .workspace-switch small,
    .nav-label,
    .sidebar-note p,
    .user-card small {
      color: #b5c5dd;
    }
    .workspace-avatar,
    .nav-count {
      background: #293f60;
      color: #dbe7ff;
      border-color: #3e5679;
    }
    .nav-item {
      color: #c2cee0;
      &:hover {
        background: #223956;
        color: white;
      }
      &.active {
        background: $accent;
        color: white;
        box-shadow: 0 4px 14px #07162d26;
      }
    }
    .sidebar-note button,
    .note-orbit {
      color: #b7d0ff;
    }
    .sidebar-note::after,
    .user-card {
      border-color: #324765;
    }
    .user-avatar {
      background: #2b4468;
      color: white;
      border-color: #3a5274;
    }
    .icon-button:hover {
      background: #293f60;
    }
  }

  .workspace-switch {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid $surface-muted;
    border-radius: 8px;
    padding: 11px 9px;
    background: $surface;
    text-align: left;
    margin-bottom: 27px;
    > span:nth-child(2) {
      min-width: 0;
      flex: 1;
    }
    strong {
      display: block;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    small {
      display: block;
      font-size: 12px;
      color: $muted;
      margin-top: 4px;
    }
  }

  .workspace-avatar {
    width: 31px;
    height: 31px;
    background: $surface-muted;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $muted;
    flex-shrink: 0;
  }

  .nav-label {
    color: $muted;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.35px;
    padding-left: 12px;
    margin: 0 0 12px;
    &:not(:first-child) {
      margin-top: 29px;
    }
  }

  .nav-item {
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 12px;
    border: none;
    background: transparent;
    border-radius: 7px;
    text-align: left;
    color: $muted;
    font-size: 13px;
    margin-bottom: 3px;
    > span:not(.nav-count):not(.new-dot) {
      flex: 1;
    }
    &:hover {
      color: $accent;
      background: $surface-muted;
    }
    &.active {
      color: $ink;
      background: $surface-muted;
      font-weight: 600;
    }
  }

  .nav-count {
    color: $ink;
    background: $surface-muted;
    border: 1px solid $border;
    font-size: 12px;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .new-dot {
    height: 5px;
    width: 5px;
    border-radius: 50%;
    background: $accent-light;
  }

  .sidebar-bottom {
    margin-top: auto;
    padding-top: 40px;
  }

  .sidebar-note {
    border: 1px solid $surface-muted;
    background: linear-gradient(125deg, $surface-muted, $surface-soft);
    border-radius: 9px;
    padding: 16px 13px;
    margin: 0 3px 18px;
    position: relative;
    overflow: hidden;
    strong {
      font-size: 12px;
      line-height: 1.6;
      display: block;
      margin-top: 9px;
    }
    p {
      font-size: 12px;
      color: $muted;
      margin-top: 5px;
    }
    button {
      border: 0;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 14px 0 0;
      font-size: 12px;
      font-weight: 600;
      color: $muted;
    }
    &::after {
      content: '';
      position: absolute;
      right: -33px;
      top: -40px;
      width: 110px;
      height: 110px;
      border: 1px solid $border;
      border-radius: 50%;
      pointer-events: none;
    }
  }

  .note-orbit {
    color: $muted;
  }

  .user-card {
    border-top: 1px solid $surface-muted;
    margin: 18px -2px 0;
    padding: 19px 0;
    display: flex;
    align-items: center;
    gap: 9px;
    > span:nth-child(2) {
      flex: 1;
    }
    strong {
      font-size: 12px;
    }
    small {
      display: block;
      font-size: 12px;
      color: $muted;
      margin-top: 3px;
    }
    .user-avatar {
      border-radius: 50%;
      background: $border;
      color: $muted;
      border: 3px solid $surface;
    }
  }

  .main-shell {
    margin-left: 225px;
  }

  .topbar {
    height: 74px;
    border-bottom: 1px solid $border;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 34px;
    background: $surface;
    position: relative;
    z-index: 20;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 11px;
    color: $muted;
    font-size: 12px;
    strong {
      color: $muted;
      font-weight: 500;
    }
    .breadcrumb-slash {
      color: $muted;
      padding: 0 4px;
    }
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .global-search {
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
    color: $muted;
    input {
      background: transparent;
      border: 0;
      padding: 6px 0;
      font-size: 12px;
      width: 146px;
      &:focus {
        outline: none;
      }
    }
    kbd {
      padding: 1px 5px;
      border: 1px solid $surface-muted;
      border-radius: 3px;
      color: $muted;
      font-size: 12px;
    }
  }

  .topbar-divider {
    width: 1px;
    height: 23px;
    background: $surface-muted;
  }

  .small-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: $border;
    color: #938365;
  }

  .demo-label {
    font-size: 12px;
    border: 1px solid $surface-muted;
    color: $muted;
    padding: 4px 7px;
    border-radius: 4px;
  }

  .notification-wrap {
    position: relative;
  }

  .notification-button {
    position: relative;
    color: $muted;
    i {
      position: absolute;
      top: 6px;
      right: 8px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #ae8767;
      border: 1px solid $surface;
    }
  }

  .search-popover,
  .notification-popover {
    position: absolute;
    background: white;
    border: 1px solid $border;
    border-radius: 9px;
    box-shadow: 0 12px 40px #172b4d20;
    top: 40px;
    right: 0;
    width: 330px;
    padding: 16px;
    .eyebrow {
      display: block;
      margin-bottom: 10px;
    }
    button {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      background: none;
      border: 0;
      padding: 12px 3px;
      text-align: left;
      border-radius: 5px;
      &:hover {
        background: $canvas;
      }
      > span {
        flex: 1;
      }
      .avatar {
        flex: initial;
      }
      small {
        display: block;
        color: $muted;
        font-size: 12px;
        margin-top: 5px;
      }
    }
    p {
      padding: 10px 0;
    }
    h3 {
      font-size: 13px;
      padding: 4px 0 10px;
    }
    strong {
      font-size: 12px;
    }
  }

  .main-content {
    max-width: 1600px;
    margin: auto;
    padding: 33px 34px 0;
  }

  .page-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 30px;
    h1 {
      font-size: 25px;
      letter-spacing: -0.85px;
      line-height: 1.3;
      font-weight: 560;
      margin-top: 9px;
    }
    p {
      color: $muted;
      font-size: 11.5px;
      margin-top: 9px;
    }
  }

  .page-eyebrow {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    letter-spacing: 1.5px;
    font-weight: 650;
    color: $muted;
  }

  .heading-actions {
    display: flex;
    align-items: center;
    gap: 9px;
    padding-top: 19px;
  }

  .date-pill {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 12px;
    color: $muted;
    white-space: nowrap;
  }

  .content-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 26px;
    padding: 18px 0 22px;
    border-top: 1px solid $surface-muted;
    color: $muted;
    font-size: 12px;
    > span {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .status-dot {
      width: 4px;
      height: 4px;
      background: $accent-light;
    }
  }

  .footer-brand {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.8px;
    margin-left: 13px;
    color: $muted;
  }

  .toast {
    position: fixed;
    bottom: 26px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 11px;
    background: $navy;
    color: $on-dark;
    padding: 15px 18px;
    border-radius: 9px;
    box-shadow: 0 8px 35px #172b4d33;
    max-width: calc(100vw - 30px);
    font-size: 12px;
    > svg {
      color: $accent-light;
      flex-shrink: 0;
    }
    button {
      background: transparent;
      border: 0;
      color: $on-dark;
      display: flex;
      align-items: center;
      padding: 3px;
    }
  }

  .toast-enter-active,
  .toast-leave-active {
    transition:
      opacity 0.2s ease,
      bottom 0.2s ease;
  }

  .toast-enter-from,
  .toast-leave-to {
    opacity: 0;
    bottom: 12px;
  }

  .startup {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 20px;
    p {
      color: $muted;
      font-size: 13px;
    }
    > svg {
      color: $muted;
    }
  }

  .mobile-menu {
    display: none;
  }

  .sidebar-overlay {
    display: none;
  }

  @media (min-width: 1500px) {
    .main-content {
      padding-top: 40px;
    }
    .page-heading {
      h1 {
        font-size: 29px;
      }
      p {
        font-size: 13px;
      }
    }
  }

  @media (max-width: 1200px) {
    .sidebar {
      width: 205px;
      padding-left: 12px;
      padding-right: 12px;
    }
    .main-shell {
      margin-left: 205px;
    }
    .topbar {
      padding: 0 24px;
    }
    .main-content {
      padding: 27px 24px 0;
    }
    .page-heading h1 {
      font-size: 22px;
    }
    .heading-actions .button {
      padding: 9px 11px;
      font-size: 12px;
    }
    .global-search input {
      width: 120px;
    }
  }

  @media (max-width: 1000px) {
    .page-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 15px;
    }
    .heading-actions {
      padding-top: 0;
    }
    .topbar-actions {
      gap: 8px;
    }
    .global-search {
      display: none;
    }
  }

  @media (max-width: 760px) {
    .sidebar {
      transform: translateX(-100%);
      transition: transform 0.2s ease;
      width: 235px;
      &.open {
        transform: translateX(0);
      }
    }
    .sidebar-overlay {
      display: block;
      position: fixed;
      inset: 0;
      background: #172b4d66;
      z-index: 25;
      backdrop-filter: blur(2px);
    }
    .sidebar-note {
      display: none;
    }
    .sidebar-bottom {
      padding-top: 20px;
    }
    .main-shell {
      margin-left: 0;
    }
    .mobile-menu {
      display: inline-flex;
      margin-left: -8px;
    }
    .topbar {
      padding: 0 20px;
      height: 62px;
    }
    .breadcrumb {
      gap: 7px;
      > svg {
        display: none;
      }
    }
    .main-content {
      padding: 25px 20px 0;
    }
    .page-heading {
      margin-bottom: 22px;
      h1 {
        font-size: 24px;
      }
      p {
        font-size: 12px;
        line-height: 1.6;
      }
    }
    .page-eyebrow {
      font-size: 12px;
    }
    .heading-actions {
      width: 100%;
      .button {
        font-size: 12px;
        padding: 10px 13px;
      }
    }
    .content-footer {
      font-size: 12px;
      > span:last-child {
        font-size: 0;
      }
      .footer-brand {
        font-size: 15px;
      }
    }
    .notification-popover {
      right: -45px;
      width: min(340px, calc(100vw - 35px));
    }
    .toast {
      width: max-content;
      font-size: 12px;
    }
  }

  @media (max-width: 390px) {
    .main-content {
      padding-left: 14px;
      padding-right: 14px;
    }
    .topbar {
      padding-left: 14px;
      padding-right: 14px;
    }
    .demo-label {
      display: none;
    }
  }

  .nav-item {
    font-size: 13px;
  }

  .nav-label {
    color: $muted;
  }

  .workspace-switch strong,
  .user-card strong {
    font-size: 12px;
  }

  .workspace-switch small,
  .user-card small {
    font-size: 12px;
    color: $muted;
  }

  .sidebar-note p {
    color: $muted;
  }

  .page-heading h1 {
    font-size: clamp(24px, 2vw, 30px);
  }

  .page-heading p {
    color: $muted;
    font-size: 13px;
    line-height: 1.7;
    max-width: 65ch;
  }

  .page-eyebrow {
    color: $muted;
    font-size: 12px;
  }

  .breadcrumb,
  .global-search input {
    font-size: 12px;
  }

  .content-footer {
    color: $muted;
    font-size: 12px;
  }

  @media (max-width: 760px) {
    .page-heading h1 {
      font-size: 24px;
    }
    .content-footer {
      font-size: 12px;
    }
  }
</style>
