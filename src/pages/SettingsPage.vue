<script setup lang="ts">
  import { ActionKind } from '../config/ui.enums';

  import Badge from '../components/ui/UiBadge.vue';
  import { CommandType, Role } from '../../shared/enums';

  import { ref } from 'vue';
  import type { Workspace } from '../../shared/schema';
  import { roleSchema } from '../../shared/schema';
  import type { Action } from '../types';
  import { notify } from '../composables/useNotifications';
  import { mutate, saving, snapshot } from '../stores/workspace';
  import Icon from '../components/ui/UiIcon.vue';

  const props = defineProps<{ workspace: Workspace }>();
  const emit = defineEmits<{ action: [action: Action] }>();
  const settings = ref({ ...props.workspace.settings });
  const error = ref('');
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

<style scoped lang="scss">
  @use '../styles/tokens' as *;

  .settings-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    gap: 23px;
    align-items: start;
  }

  .settings-panel {
    margin-bottom: 22px;
    .panel-header {
      padding-bottom: 22px;
      border-bottom: 1px solid $surface-soft;
      padding: 24px 24px 0;
    }
    form {
      padding: 22px;
    }
  }

  .details-list {
    margin: 0;
    padding: 10px 22px 18px;
    > div {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      padding: 14px 0;
      border-bottom: 1px solid $surface-soft;
      font-size: 12px;
    }
    dt {
      color: $muted;
    }
    dd {
      margin: 0;
    }
  }

  .member-row {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 20px;
    > div {
      flex: 1;
      min-width: 0;
    }
    strong {
      font-size: 12px;
    }
    small {
      display: block;
      color: $muted;
      font-size: 12px;
      margin-top: 5px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .integration-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 21px;
    border-bottom: 1px solid $surface-soft;
    > div {
      flex: 1;
    }
    strong {
      font-size: 12px;
    }
    small {
      display: block;
      color: $muted;
      font-size: 12px;
      margin-top: 5px;
      line-height: 1.6;
    }
  }

  .toggle-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 20px;
    border-bottom: 1px solid $surface-soft;
    input {
      width: 34px;
      height: 20px;
      accent-color: $accent;
      cursor: pointer;
    }
    small {
      font-weight: 400;
      display: block;
      font-size: 12px;
      color: $muted;
      margin-top: 6px;
    }
  }

  .rules-panel {
    position: sticky;
    top: 20px;
  }

  @media (max-width: 1200px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }
    .rules-panel {
      position: static;
    }
  }

  @media (max-width: 760px) {
    .settings-grid {
      gap: 0;
    }
    .settings-panel .panel-header .button {
      font-size: 12px;
    }
    .member-row .compact-select {
      max-width: 110px;
    }
    .integration-row {
      flex-wrap: wrap;
      .badge {
        margin-left: 54px;
      }
    }
  }

  .details-list dt,
  .member-row small,
  .integration-row small {
    color: $muted;
  }
</style>
