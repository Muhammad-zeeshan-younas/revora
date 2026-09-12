<script setup lang="ts">
  import type { ActionForm } from './action-form.types';
  import {
    CommunicationChannel,
    InteractionOutcome,
    MessageDirection,
  } from '../../../shared/enums';

  const form = defineModel<ActionForm>({ required: true });
</script>

<template>
  <div class="form-grid">
    <label>
      Channel
      <select v-model="form.channel">
        <option
          v-for="channel in Object.values(CommunicationChannel)"
          :key="channel"
          :value="channel"
        >
          {{ channel }}
        </option>
      </select>
    </label>
    <label>
      Direction
      <select v-model="form.direction">
        <option
          v-for="direction in Object.values(MessageDirection)"
          :key="direction"
          :value="direction"
        >
          {{ direction }}
        </option>
      </select>
    </label>
  </div>
  <label>
    Conversation / customer reply
    <textarea
      v-model="form.message"
      required
      rows="5"
      maxlength="2000"
      placeholder="What was discussed?"
    ></textarea>
  </label>
  <div class="form-grid">
    <label>
      Outcome
      <select v-model="form.outcome">
        <option
          v-for="outcome in Object.values(InteractionOutcome)"
          :key="outcome"
          :value="outcome"
        >
          {{ outcome }}
        </option>
      </select>
    </label>
    <label>
      Next action
      <input
        v-model="form.nextAction"
        placeholder="e.g. Call accounts manager on Friday"
      />
    </label>
  </div>
  <p class="field-help">This records a conversation. It does not send a message to the customer.</p>
</template>
