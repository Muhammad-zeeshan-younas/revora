<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import { z } from 'zod';
  import { request } from '../lib/http-client';
  import { loadWorkspace } from '../stores/workspace';
  import Icon from './ui/UiIcon.vue';
  import { AuthMode } from '../config/ui.enums';

  const mode = new URLSearchParams(location.search).has('invite')
    ? AuthMode.Invite
    : AuthMode.Login;
  const email = ref('');
  const password = ref('');
  const name = ref('');
  const pending = ref(false);
  const error = ref('');
  const demoEnabled = ref(false);
  onMounted(async () => {
    try {
      demoEnabled.value = (
        await request('/auth/config', z.object({ demoEnabled: z.boolean() }))
      ).demoEnabled;
    } catch {
      error.value = 'The server is unavailable. Start the backend and retry.';
    }
  });

  async function signIn(demo = false): Promise<void> {
    pending.value = true;
    error.value = '';
    try {
      const path = demo
        ? '/auth/demo'
        : mode === AuthMode.Invite
          ? '/auth/accept-invite'
          : '/auth/login';
      const body = demo
        ? {}
        : mode === AuthMode.Invite
          ? {
              token: new URLSearchParams(location.search).get('invite'),
              name: name.value,
              password: password.value,
            }
          : { email: email.value, password: password.value };
      await request(path, z.object({ ok: z.boolean() }), body);
      history.replaceState({}, '', location.pathname);
      await loadWorkspace();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Sign in failed.';
    } finally {
      pending.value = false;
    }
  }
</script>
<template>
  <main class="auth-layout">
    <section class="auth-story">
      <a
        class="brand"
        href="#"
      >
        <span class="brand-mark">
          r
          <span>↗</span>
        </span>
        revora
        <span class="brand-period">.</span>
      </a>
      <div class="auth-story-content">
        <span class="eyebrow light">YOUR MONEY. MOVING FORWARD.</span>
        <h1>
          Good business.
          <br />
          Better cash flow.
        </h1>
        <p>Bring your receivables, collections, and payments into one clear picture.</p>
        <div class="auth-preview">
          <div>
            <span>From outstanding to outstanding.</span>
            <Icon
              name="upRight"
              :size="28"
            />
          </div>
          <div class="preview-bars">
            <i
              v-for="(height, index) in [26, 38, 31, 52, 43, 68, 61, 82, 74, 95]"
              :key="index"
              :style="{ height: `${height}%` }"
            ></i>
          </div>
          <footer>
            Clarity for every rupee.
            <span>Built for Pakistan</span>
          </footer>
        </div>
      </div>
      <footer class="auth-footer">
        <Icon
          name="shield"
          :size="18"
        />
        A more considered way to manage receivables.
      </footer>
    </section>
    <section class="auth-form">
      <div class="auth-form-inner">
        <span class="eyebrow">WELCOME TO REVORA</span>
        <h2>
          {{ mode === AuthMode.Login ? 'Your workspace awaits.' : 'Join your team.' }}
        </h2>
        <p>
          {{
            mode === AuthMode.Login
              ? 'Sign in to keep your business moving forward.'
              : 'Accept your invitation to access your company workspace.'
          }}
        </p>
        <form @submit.prevent="signIn()">
          <label v-if="mode === AuthMode.Invite">
            Full name
            <input
              v-model="name"
              required
              autocomplete="name"
              placeholder="Hassan Ahmed"
            />
          </label>
          <label v-if="mode === AuthMode.Login">
            Work email
            <input
              v-model="email"
              required
              type="email"
              autocomplete="email"
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              v-model="password"
              required
              type="password"
              :minlength="mode === AuthMode.Login ? 1 : 12"
              :autocomplete="mode === AuthMode.Login ? 'current-password' : 'new-password'"
              :placeholder="
                mode === AuthMode.Login ? 'Enter your password' : 'At least 12 characters'
              "
            />
          </label>
          <p
            v-if="error"
            class="form-error"
            role="alert"
          >
            {{ error }}
          </p>
          <button
            class="button primary full"
            :disabled="pending"
          >
            <Icon
              v-if="pending"
              name="spinner"
              class="spin"
            />
            {{ mode === AuthMode.Login ? 'Sign in' : 'Join workspace' }}
            <Icon name="arrow" />
          </button>
        </form>
        <template v-if="demoEnabled && mode === AuthMode.Login">
          <div class="divider-text">OR TAKE A LOOK AROUND</div>
          <button
            class="button full"
            :disabled="pending"
            @click="signIn(true)"
          >
            <Icon name="sparkle" />
            Explore demo workspace
          </button>
          <p class="small center">Sample data. Your own isolated workspace.</p>
        </template>
        <aside
          v-if="mode === AuthMode.Login"
          class="company-setup"
          aria-label="Company setup"
        >
          <h3>New to Revora?</h3>
          <p>
            Contact the Revora team to get started. We’ll set up your company workspace and arrange
            access for your team.
          </p>
        </aside>
        <div class="auth-security">
          <Icon
            name="lock"
            :size="16"
          />
          Secure sessions · Organization-specific access
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss" src="./AuthScreen.scss"></style>
