<script setup lang="ts">
  import { ActionKind } from '../config/ui.enums';

  import Badge from '../components/ui/UiBadge.vue';
  import { CommandType, Role } from '../../shared/enums';

  import { computed, onMounted, ref } from 'vue';
  import { z } from 'zod';
  import type { Workspace } from '../../shared/schema';
  import { roleSchema } from '../../shared/schema';
  import type { Action } from '../types';
  import { notify } from '../composables/useNotifications';
  import { mutate, saving, snapshot } from '../stores/workspace';
  import Icon from '../components/ui/UiIcon.vue';
  import { request } from '../lib/http-client';
  import {
    disableOfflineAccount,
    enableOfflineAccount,
    hasOfflineAccount,
  } from '../stores/offline-account';

  const TERRITORY_PREVIEW_LIMIT = 30;
  const territoryResponseSchema = z.object({
    assignments: z.record(z.string(), z.string()),
    revision: z.number().int(),
  });

  const props = defineProps<{ workspace: Workspace }>();
  const emit = defineEmits<{ action: [action: Action] }>();
  const settings = ref({ ...props.workspace.settings });
  const error = ref('');
  const territorySearch = ref('');
  const territoryAssignments = ref<Record<string, string>>({});
  const territorySaving = ref(false);
  const offlinePassphrase = ref('');
  const offlineEnabled = ref(false);
  const offlineSaving = ref(false);
  const mfaEnabled = ref(false);
  const mfaAvailable = ref(false);
  const mfaPassword = ref('');
  const mfaCode = ref('');
  const mfaSecret = ref('');
  const mfaBusy = ref(false);
  const emailVerified = ref(false);
  const emailVerificationAvailable = ref(false);
  const territoryCustomers = computed(() =>
    props.workspace.customers
      .filter((customer) =>
        `${customer.name} ${customer.city}`
          .toLowerCase()
          .includes(territorySearch.value.trim().toLowerCase()),
      )
      .slice(0, TERRITORY_PREVIEW_LIMIT),
  );
  const templateHelp = 'Use {{customer}}, {{invoice}}, and {{amount}} as placeholders.';

  async function save(): Promise<void> {
    error.value = '';
    try {
      await mutate({ type: CommandType.UpdateSettings, settings: settings.value });
      notify('Collection rules saved.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Unable to save settings.';
    }
  }

  async function changeRole(memberId: string, event: Event): Promise<void> {
    if (!(event.target instanceof HTMLSelectElement)) {
      return;
    }
    const result = roleSchema.safeParse(event.target.value);
    if (!result.success) {
      return;
    }
    try {
      await mutate({ type: CommandType.UpdateMemberRole, memberId, role: result.data });
      notify('Team role updated.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Unable to update role.';
      event.target.value =
        props.workspace.members.find((member) => member.id === memberId)?.role ?? Role.Viewer;
    }
  }

  async function loadTerritories(): Promise<void> {
    if (![Role.Owner, Role.Admin].includes(snapshot.value?.session.user.role ?? Role.Viewer)) {
      return;
    }
    try {
      territoryAssignments.value = await request(
        '/workspace/territories',
        z.record(z.string(), z.string()),
      );
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Unable to load territories.';
    }
  }

  async function assignTerritory(customerId: string, event: Event): Promise<void> {
    if (!(event.target instanceof HTMLSelectElement) || !snapshot.value) {
      return;
    }
    const previous = territoryAssignments.value[customerId] ?? '';
    const userId = event.target.value;
    territorySaving.value = true;
    error.value = '';
    try {
      const result = await request('/workspace/territories', territoryResponseSchema, {
        customerId,
        userId,
        revision: snapshot.value.revision,
      });
      territoryAssignments.value = result.assignments;
      snapshot.value = { ...snapshot.value, revision: result.revision };
      notify(userId ? 'Customer assigned to salesperson.' : 'Customer assignment removed.');
    } catch (cause) {
      event.target.value = previous;
      error.value = cause instanceof Error ? cause.message : 'Unable to assign customer.';
    } finally {
      territorySaving.value = false;
    }
  }

  async function saveOfflineAccount(): Promise<void> {
    if (!snapshot.value) {return;}
    offlineSaving.value = true;
    error.value = '';
    try {
      await enableOfflineAccount(snapshot.value, offlinePassphrase.value);
      offlineEnabled.value = true;
      offlinePassphrase.value = '';
      notify('Encrypted offline account view saved on this device.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not save offline account.';
    } finally {
      offlineSaving.value = false;
    }
  }

  function removeOfflineAccount(): void {
    if (!snapshot.value) {return;}
    disableOfflineAccount(snapshot.value);
    offlineEnabled.value = false;
    notify('Offline account copy removed from this device.');
  }

  async function loadMfa(): Promise<void> {
    try {
      const status = await request(
        '/auth/mfa',
        z.object({ enabled: z.boolean(), available: z.boolean() }),
      );
      mfaEnabled.value = status.enabled;
      mfaAvailable.value = status.available;
    } catch {
      // Account settings remain available when security status cannot be loaded.
    }
  }

  async function loadEmailVerification(): Promise<void> {
    try {
      const status = await request(
        '/auth/email-verification/status',
        z.object({ verified: z.boolean(), available: z.boolean() }),
      );
      emailVerified.value = status.verified;
      emailVerificationAvailable.value = status.available;
    } catch {
      // Email configuration is optional for a local development workspace.
    }
  }

  async function requestEmailVerification(): Promise<void> {
    if (!snapshot.value) {return;}
    error.value = '';
    try {
      await request('/auth/email-verification/request', z.object({ ok: z.boolean() }), {
        email: snapshot.value.session.user.email,
      });
      notify('If verification is needed, a link has been sent to your email.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not request verification.';
    }
  }

  async function beginMfa(): Promise<void> {
    mfaBusy.value = true;
    error.value = '';
    try {
      const result = await request(
        '/auth/mfa/begin',
        z.object({ secret: z.string(), uri: z.string() }),
        { password: mfaPassword.value },
      );
      mfaSecret.value = result.secret;
      mfaCode.value = '';
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not start authenticator setup.';
    } finally {
      mfaBusy.value = false;
    }
  }

  async function confirmMfa(): Promise<void> {
    mfaBusy.value = true;
    error.value = '';
    try {
      await request('/auth/mfa/confirm', z.object({ ok: z.boolean() }), { code: mfaCode.value });
      mfaEnabled.value = true;
      mfaSecret.value = '';
      mfaPassword.value = '';
      mfaCode.value = '';
      notify('Authenticator enabled. A fresh code is needed at sign-in.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not confirm authenticator.';
    } finally {
      mfaBusy.value = false;
    }
  }

  async function disableMfa(): Promise<void> {
    mfaBusy.value = true;
    error.value = '';
    try {
      await request('/auth/mfa/disable', z.object({ ok: z.boolean() }), {
        password: mfaPassword.value,
        code: mfaCode.value,
      });
      mfaEnabled.value = false;
      mfaPassword.value = '';
      mfaCode.value = '';
      notify('Authenticator disabled.');
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not disable authenticator.';
    } finally {
      mfaBusy.value = false;
    }
  }

  onMounted(() => {
    void loadTerritories();
    void loadMfa();
    void loadEmailVerification();
    offlineEnabled.value = Boolean(snapshot.value && hasOfflineAccount(snapshot.value));
  });
</script>
<template>
  <div class="settings-grid">
    <div>
      <section class="panel settings-panel">
        <header class="panel-header">
          <div>
            <h2>Workspace details</h2>
            <p>The home for your business finances.</p>
          </div>
          <Icon name="building" />
        </header>
        <dl class="details-list">
          <div>
            <dt>Organization</dt>
            <dd>{{ workspace.organization.name }}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>Pakistani Rupee · PKR</dd>
          </div>
          <div>
            <dt>Timezone</dt>
            <dd>Asia/Karachi · UTC+05:00</dd>
          </div>
          <div>
            <dt>Your role</dt>
            <dd>{{ snapshot?.session.user.role }}</dd>
          </div>
        </dl>
      </section>
      <section
        v-if="snapshot?.session.user.role === Role.Sales"
        class="panel settings-panel"
      >
        <header class="panel-header">
          <div>
            <h2>Offline field accounts</h2>
            <p>
              Save your assigned accounts in an encrypted copy on this device. You will need the
              passphrase after a disconnected reload.
            </p>
          </div>
          <Icon name="shield" />
        </header>
        <label>
          Offline passphrase (at least 12 characters)
          <input
            v-model="offlinePassphrase"
            type="password"
            autocomplete="new-password"
            minlength="12"
          />
        </label>
        <div class="settings-actions">
          <button
            class="button primary small"
            :disabled="offlineSaving || offlinePassphrase.length < 12"
            @click="saveOfflineAccount"
          >
            {{ offlineEnabled ? 'Update offline copy' : 'Enable offline view' }}
          </button>
          <button
            v-if="offlineEnabled"
            class="button small"
            @click="removeOfflineAccount"
          >
            Remove offline copy
          </button>
        </div>
      </section>
      <section
        v-if="mfaAvailable || mfaEnabled"
        class="panel settings-panel"
      >
        <header class="panel-header">
          <div>
            <h2>Authenticator sign-in</h2>
            <p>
              {{
                mfaEnabled
                  ? 'Enabled for your account.'
                  : 'Use a six-digit code from an authenticator app when signing in.'
              }}
            </p>
          </div>
          <Icon name="shield" />
        </header>
        <label>
          Current password
          <input
            v-model="mfaPassword"
            type="password"
            autocomplete="current-password"
          />
        </label>
        <button
          v-if="!mfaEnabled && !mfaSecret"
          class="button small"
          :disabled="mfaBusy || !mfaPassword"
          @click="beginMfa"
        >
          Set up authenticator
        </button>
        <template v-if="mfaSecret">
          <p>Add this setup key in your authenticator app, then enter its code:</p>
          <code>{{ mfaSecret }}</code>
        </template>
        <label v-if="mfaSecret || mfaEnabled">
          Six-digit code
          <input
            v-model="mfaCode"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
          />
        </label>
        <button
          v-if="mfaSecret"
          class="button primary small"
          :disabled="mfaBusy || mfaCode.length !== 6"
          @click="confirmMfa"
        >
          Confirm authenticator
        </button>
        <button
          v-if="mfaEnabled"
          class="button small"
          :disabled="mfaBusy || !mfaPassword || mfaCode.length !== 6"
          @click="disableMfa"
        >
          Disable authenticator
        </button>
      </section>
      <section
        v-if="emailVerificationAvailable"
        class="panel settings-panel"
      >
        <header class="panel-header">
          <div>
            <h2>Email verification</h2>
            <p>
              {{
                emailVerified
                  ? 'Your work email is verified.'
                  : 'Verify your work email to keep account access available.'
              }}
            </p>
          </div>
          <Icon name="email" />
        </header>
        <button
          v-if="!emailVerified"
          class="button small"
          @click="requestEmailVerification"
        >
          Send verification link
        </button>
      </section>
      <section
        v-if="
          snapshot?.session.user.role === Role.Owner || snapshot?.session.user.role === Role.Admin
        "
        class="panel settings-panel"
      >
        <header class="panel-header">
          <div>
            <h2>Sales territories</h2>
            <p>Sales members see only customers assigned to them.</p>
          </div>
          <Icon name="users" />
        </header>
        <label>
          Find customer
          <input
            v-model="territorySearch"
            placeholder="Search customer or city"
          />
        </label>
        <div
          v-for="customer in territoryCustomers"
          :key="customer.id"
          class="member-row"
        >
          <span class="avatar">{{ customer.name.slice(0, 1) }}</span>
          <div>
            <strong>{{ customer.name }}</strong>
            <small>{{ customer.city }}</small>
          </div>
          <select
            :value="territoryAssignments[customer.id] ?? ''"
            :aria-label="`Salesperson for ${customer.name}`"
            :disabled="territorySaving"
            class="compact-select"
            @change="assignTerritory(customer.id, $event)"
          >
            <option value="">Unassigned</option>
            <option
              v-for="member in workspace.members.filter((item) => item.role === Role.Sales)"
              :key="member.id"
              :value="member.id"
            >
              {{ member.name }}
            </option>
          </select>
        </div>
      </section>
      <section class="panel settings-panel">
        <header class="panel-header">
          <div>
            <h2>Your team</h2>
            <p>The right access for every role.</p>
          </div>
          <button
            class="button small"
            @click="emit('action', { kind: ActionKind.Invite })"
          >
            <Icon
              name="plus"
              :size="16"
            />
            Invite member
          </button>
        </header>
        <div
          v-for="member in workspace.members"
          :key="member.id"
          class="member-row"
        >
          <span class="avatar">{{ member.name.slice(0, 1) }}</span>
          <div>
            <strong>{{ member.name }}</strong>
            <small>{{ member.email.startsWith('demo-') ? 'Demo account' : member.email }}</small>
          </div>
          <select
            :value="member.role"
            class="compact-select"
            :aria-label="`Role for ${member.name}`"
            :disabled="
              member.role === Role.Owner || snapshot?.session.user.role !== Role.Owner || saving
            "
            @change="changeRole(member.id, $event)"
          >
            <option
              v-for="role in roleSchema.options"
              :key="role"
              :disabled="role === Role.Owner"
            >
              {{ role }}
            </option>
          </select>
        </div>
      </section>
      <section class="panel settings-panel">
        <header class="panel-header">
          <div>
            <h2>Connections</h2>
            <p>A connected workflow starts with reliable data.</p>
          </div>
          <Icon name="link" />
        </header>
        <div class="integration-row">
          <span class="integration-logo">
            <Icon
              name="whatsapp"
              :size="26"
            />
          </span>
          <div>
            <strong>WhatsApp Business</strong>
            <small>Local outbox available · Delivery not connected</small>
          </div>
          <Badge label="Not connected" />
        </div>
        <div class="integration-row">
          <span class="integration-logo">
            <Icon
              name="csv"
              :size="26"
            />
          </span>
          <div>
            <strong>Bank statements & accounting</strong>
            <small>Import customers, invoices, and bank CSV files</small>
          </div>
          <Badge label="CSV ready" />
        </div>
        <div class="integration-row">
          <span class="integration-logo">
            <Icon
              name="sparkle"
              :size="26"
            />
          </span>
          <div>
            <strong>Reply assistant</strong>
            <small>Rule-based extraction · Human confirmation required</small>
          </div>
          <Badge label="Local rules" />
        </div>
      </section>
    </div>
    <section class="panel settings-panel rules-panel">
      <header class="panel-header">
        <div>
          <h2>Collection rules</h2>
          <p>Consistent follow-ups, on your terms.</p>
        </div>
        <Icon name="settings" />
      </header>
      <form @submit.prevent="save">
        <label class="toggle-row">
          <span>
            <strong>Schedule reminder preparation</strong>
            <small>Prepare overdue reminders in the local outbox.</small>
          </span>
          <input
            v-model="settings.remindersEnabled"
            type="checkbox"
            role="switch"
          />
        </label>
        <div class="form-grid">
          <label>
            Prepare after (Karachi time)
            <select v-model.number="settings.reminderHour">
              <option
                v-for="hour in 11"
                :key="hour"
                :value="hour + 7"
              >
                {{ hour + 7 }}:00
              </option>
            </select>
          </label>
          <label>
            Daily reminder limit
            <input
              v-model.number="settings.dailyLimit"
              type="number"
              min="1"
              max="100"
              required
            />
          </label>
        </div>
        <label>
          Reminder template
          <textarea
            v-model="settings.template"
            rows="7"
            minlength="20"
            maxlength="1500"
            required
          ></textarea>
        </label>
        <p class="field-help">{{ templateHelp }}</p>
        <div class="info-note">
          <Icon
            name="shield"
            :size="20"
          />
          <p>
            One reminder per customer per day. Accounts on hold are excluded. Scheduling runs every
            30 seconds while the backend is running.
          </p>
        </div>
        <p
          v-if="error"
          class="form-error"
          role="alert"
        >
          {{ error }}
        </p>
        <button
          class="button primary full"
          :disabled="saving"
        >
          <Icon
            v-if="saving"
            name="spinner"
            class="spin"
          />
          Save collection rules
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped lang="scss" src="./SettingsPage.scss"></style>
