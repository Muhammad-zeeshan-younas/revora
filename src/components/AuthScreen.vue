<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import { z } from 'zod';
  import { request } from '../lib/http-client';
  import { loadWorkspace } from '../stores/workspace';
  import Icon from './ui/UiIcon.vue';

  const mode = ref<'login' | 'register' | 'invite'>(
    new URLSearchParams(location.search).has('invite') ? 'invite' : 'login',
  );
  const email = ref('');
  const password = ref('');
  const name = ref('');
  const organization = ref('');
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
        : mode.value === 'invite'
          ? '/auth/accept-invite'
          : `/auth/${mode.value}`;
      const body = demo
        ? {}
        : mode.value === 'invite'
          ? {
              token: new URLSearchParams(location.search).get('invite'),
              name: name.value,
              password: password.value,
            }
          : mode.value === 'register'
            ? {
                email: email.value,
                password: password.value,
                name: name.value,
                organization: organization.value,
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
          {{
            mode === 'login'
              ? 'Your workspace awaits.'
              : mode === 'invite'
                ? 'Join your team.'
                : 'Make room for growth.'
          }}
        </h2>
        <p>
          {{
            mode === 'login'
              ? 'Sign in to keep your business moving forward.'
              : 'A clear view of your business starts here.'
          }}
        </p>
        <form @submit.prevent="signIn()">
          <label v-if="mode !== 'login'">
            Full name
            <input
              v-model="name"
              required
              autocomplete="name"
              placeholder="Hassan Ahmed"
            />
          </label>
          <label v-if="mode === 'register'">
            Organization
            <input
              v-model="organization"
              required
              placeholder="Your business name"
            />
          </label>
          <label v-if="mode !== 'invite'">
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
              :minlength="mode === 'login' ? 1 : 12"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              :placeholder="mode === 'login' ? 'Enter your password' : 'At least 12 characters'"
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
            {{
              mode === 'login'
                ? 'Sign in'
                : mode === 'invite'
                  ? 'Join workspace'
                  : 'Create workspace'
            }}
            <Icon name="arrow" />
          </button>
        </form>
        <template v-if="demoEnabled && mode === 'login'">
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
        <p
          v-if="mode !== 'invite'"
          class="auth-switch"
        >
          {{ mode === 'login' ? 'New to Revora?' : 'Already have a workspace?' }}
          <button
            class="text-button"
            @click="
              mode = mode === 'login' ? 'register' : 'login';
              error = '';
            "
          >
            {{ mode === 'login' ? 'Create an account' : 'Sign in' }}
          </button>
        </p>
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

<style scoped lang="scss">
  @use '../styles/tokens' as *;

  .auth-layout {
    min-height: 100dvh;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .auth-story {
    padding: 42px 55px 30px;
    background: radial-gradient(ellipse at 10% 85%, #294e85, transparent 65%), $navy;
    color: $on-dark;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    .brand {
      color: $on-dark;
      .brand-mark {
        background: $accent-light;
        color: $navy;
      }
    }
    &::after {
      content: '';
      position: absolute;
      border: 1px solid #172b4d30;
      width: 800px;
      height: 800px;
      border-radius: 50%;
      right: -640px;
      top: -160px;
      box-shadow:
        0 0 0 45px #172b4d0b,
        0 0 0 90px #172b4d09;
      pointer-events: none;
    }
  }

  .auth-story-content {
    margin: auto 0;
    padding: 75px 0 40px;
    h1 {
      font-family: $font-heading;
      font-size: clamp(42px, 4.6vw, 72px);
      font-weight: 600;
      letter-spacing: -2px;
      line-height: 1.12;
      margin: 24px 0;
    }
    > p {
      font-size: 14px;
      line-height: 1.8;
      max-width: 340px;
      color: #c1cee2;
    }
  }

  .auth-preview {
    margin-top: 45px;
    padding: 23px 25px;
    max-width: 430px;
    background: #ffffff07;
    border: 1px solid #6a88b950;
    border-radius: 13px;
    > div:first-child {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #c1cee2;
      font-size: 12px;
    }
    footer {
      font-size: 12px;
      color: #c1cee2;
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #172b4d50;
      padding-top: 16px;
    }
  }

  .preview-bars {
    height: 130px;
    display: flex;
    align-items: flex-end;
    gap: 11px;
    padding: 20px 0;
    i {
      flex: 1;
      background: linear-gradient($accent-light, #172b4d20);
      border-radius: 4px 4px 0 0;
    }
  }

  .auth-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #c1cee2;
    font-size: 12px;
  }

  .auth-form {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 50px;
    background: $surface;
  }

  .auth-form-inner {
    width: 100%;
    max-width: 350px;
    > h2 {
      font-size: 29px;
      font-weight: 550;
      letter-spacing: -0.9px;
      margin-top: 15px;
    }
    > p {
      color: $muted;
      font-size: 12px;
      line-height: 1.8;
      margin: 12px 0 32px;
    }
    form {
      margin-top: 28px;
    }
    label {
      margin-bottom: 24px;
      font-size: 13px;
      gap: 10px;
    }
    .small {
      margin: 12px 0 23px;
      font-size: 12px;
    }
    .auth-switch {
      font-size: 12px;
      text-align: center;
      .text-button {
        font-size: 12px;
        margin-left: 4px;
      }
    }
  }

  .divider-text {
    display: flex;
    align-items: center;
    gap: 15px;
    font-size: 12px;
    letter-spacing: 1px;
    color: $muted;
    margin: 25px 0;
    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 1px;
      background: $surface-muted;
    }
  }

  .auth-security {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    font-size: 12px;
    color: $muted;
    margin-top: 35px;
    padding-top: 22px;
    border-top: 1px solid $surface-muted;
  }

  @media (max-width: 1000px) {
    .auth-story {
      padding: 35px;
    }
    .auth-form {
      padding: 35px;
    }
    .auth-story-content h1 {
      font-size: 49px;
    }
  }

  @media (max-width: 760px) {
    .auth-layout {
      grid-template-columns: 1fr;
    }
    .auth-story {
      padding: 25px;
      min-height: 230px;
      .brand {
        font-size: 25px;
      }
    }
    .auth-story-content {
      padding: 35px 0 15px;
      h1 {
        font-size: 37px;
        margin: 16px 0;
        br {
          display: none;
        }
      }
      > p {
        font-size: 12px;
        max-width: 100%;
      }
      > .eyebrow {
        font-size: 12px;
      }
    }
    .auth-preview,
    .auth-footer {
      display: none;
    }
    .auth-form {
      padding: 38px 25px;
    }
    .auth-form-inner {
      max-width: 420px;
      > h2 {
        font-size: 26px;
      }
    }
  }

  .auth-form-inner > p {
    color: $muted;
  }
</style>
