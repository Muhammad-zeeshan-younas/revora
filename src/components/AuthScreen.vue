<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import { z } from 'zod';
  import { request } from '../lib/http-client';
  import { loadBootstrapWorkspace, loadWorkspace } from '../stores/workspace';
  import Icon from './ui/UiIcon.vue';
  import { AuthMode } from '../config/ui.enums';

  const mode = new URLSearchParams(location.search).has('invite')
    ? AuthMode.Invite
    : AuthMode.Login;
  const resetToken = new URLSearchParams(location.search).get('reset');
  const verificationToken = new URLSearchParams(location.search).get('verify');
  const verificationMessage = ref('');
  const verificationSent = ref(false);
  const passwordReset = ref(Boolean(resetToken));
  const resetSent = ref(false);
  const email = ref('');
  const password = ref('');
  const authenticatorCode = ref('');
  const mfaRequired = ref(false);
  const name = ref('');
  const pending = ref(false);
  const error = ref('');
  const demoEnabled = ref(false);
  const passwordResetEnabled = ref(false);
  onMounted(async () => {
    if (verificationToken) {
      try {
        await request('/auth/email-verification/complete', z.object({ ok: z.boolean() }), {
          token: verificationToken,
        });
        verificationMessage.value = 'Email verified. You can sign in now.';
        history.replaceState({}, '', location.pathname);
      } catch (cause) {
        verificationMessage.value =
          cause instanceof Error ? cause.message : 'Email verification failed.';
      }
    }
    try {
      const config = await request(
        '/auth/config',
        z.object({ demoEnabled: z.boolean(), passwordResetEnabled: z.boolean() }),
      );
      demoEnabled.value = config.demoEnabled;
      passwordResetEnabled.value = config.passwordResetEnabled;
    } catch {
      error.value = 'The server is unavailable. Start the backend and retry.';
    }
  });

  async function resendVerification(): Promise<void> {
    pending.value = true;
    error.value = '';
    try {
      await request('/auth/email-verification/request', z.object({ ok: z.boolean() }), {
        email: email.value,
      });
      verificationSent.value = true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Could not send verification email.';
    } finally {
      pending.value = false;
    }
  }

  async function signIn(demo = false): Promise<void> {
    pending.value = true;
    error.value = '';
    try {
      if (passwordReset.value) {
        await request(
          resetToken ? '/auth/password-reset/complete' : '/auth/password-reset/request',
          z.object({ ok: z.boolean() }),
          resetToken ? { token: resetToken, password: password.value } : { email: email.value },
        );
        resetSent.value = true;
        if (resetToken) {
          history.replaceState({}, '', location.pathname);
        }

        return;
      }
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
          : {
              email: email.value,
              password: password.value,
              ...(mfaRequired.value ? { code: authenticatorCode.value } : {}),
            };
      const result = await request(
        path,
        z.object({ ok: z.boolean(), mfaRequired: z.boolean().optional() }),
        body,
      );
      if (result.mfaRequired) {
        mfaRequired.value = true;
        authenticatorCode.value = '';

        return;
      }
      history.replaceState({}, '', location.pathname);
      if (window.location.hash && window.location.hash !== '#overview') {await loadWorkspace();}
      else {await loadBootstrapWorkspace();}
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
            passwordReset
              ? resetToken
                ? 'Choose a new password.'
                : 'Reset your password.'
              : mode === AuthMode.Login
                ? 'Your workspace awaits.'
                : 'Join your team.'
          }}
        </h2>
        <p>
          {{
            passwordReset
              ? resetSent
                ? resetToken
                  ? 'Your password has been updated. Return to sign in.'
                  : 'Check your email, or return to sign in.'
                : resetToken
                  ? 'Enter a new password to regain access.'
                  : 'We will email a reset link if an account exists.'
              : mode === AuthMode.Login
                ? 'Sign in to keep your business moving forward.'
                : 'Accept your invitation to access your company workspace.'
          }}
        </p>
        <p
          v-if="verificationMessage"
          role="status"
        >
          {{ verificationMessage }}
        </p>
        <p
          v-if="verificationSent"
          role="status"
        >
          If this account needs verification, check your inbox for a link.
        </p>
        <form
          v-if="!resetSent"
          @submit.prevent="signIn()"
        >
          <label v-if="mode === AuthMode.Invite && !passwordReset">
            Full name
            <input
              v-model="name"
              required
              autocomplete="name"
              placeholder="Hassan Ahmed"
            />
          </label>
          <label v-if="mode === AuthMode.Login && (!passwordReset || !resetToken)">
            Work email
            <input
              v-model="email"
              required
              type="email"
              autocomplete="email"
              placeholder="you@company.com"
            />
          </label>
          <label v-if="!passwordReset || resetToken">
            Password
            <input
              v-model="password"
              required
              type="password"
              :minlength="passwordReset || mode !== AuthMode.Login ? 12 : 1"
              :autocomplete="mode === AuthMode.Login ? 'current-password' : 'new-password'"
              :placeholder="
                mode === AuthMode.Login ? 'Enter your password' : 'At least 12 characters'
              "
            />
          </label>
          <label v-if="mfaRequired && !passwordReset">
            Authenticator code
            <input
              v-model="authenticatorCode"
              required
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]{6}"
              maxlength="6"
              placeholder="Six-digit code"
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
              passwordReset
                ? resetToken
                  ? 'Save new password'
                  : 'Send reset link'
                : mode === AuthMode.Login
                  ? 'Sign in'
                  : 'Join workspace'
            }}
            <Icon name="arrow" />
          </button>
        </form>
        <button
          v-if="mode === AuthMode.Login && !passwordReset && passwordResetEnabled"
          type="button"
          class="text-button"
          @click="passwordReset = true"
        >
          Forgot password?
        </button>
        <button
          v-if="mode === AuthMode.Login && !passwordReset && passwordResetEnabled && email"
          type="button"
          class="text-button"
          :disabled="pending"
          @click="resendVerification"
        >
          Send email verification link
        </button>
        <button
          v-if="passwordReset"
          type="button"
          class="text-button"
          @click="
            passwordReset = false;
            resetSent = false;
            error = '';
          "
        >
          Back to sign in
        </button>
        <template v-if="demoEnabled && mode === AuthMode.Login && !passwordReset">
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
