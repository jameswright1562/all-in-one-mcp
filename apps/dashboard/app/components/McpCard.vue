<script setup lang="ts">
import type { ManagedMcpSnapshot } from "all-in-one-mcp/contracts";

defineProps<{
  snapshot: ManagedMcpSnapshot;
  selected: boolean;
  busy: boolean;
}>();

defineEmits<{
  select: [];
  action: [action: "start" | "stop" | "restart"];
}>();
</script>

<template>
  <article class="mcp-card" :class="{ 'is-selected': selected }">
    <button class="mcp-card__surface" type="button" @click="$emit('select')">
      <div class="mcp-card__header">
        <div>
          <p class="mcp-card__eyebrow">{{ snapshot.definition.transport }}</p>
          <h3>{{ snapshot.definition.name }}</h3>
        </div>
        <span class="status-pill" :data-status="snapshot.status">{{
          snapshot.status
        }}</span>
      </div>

      <p class="mcp-card__id">{{ snapshot.definition.toolPrefix }}</p>

      <dl class="mcp-card__stats">
        <div>
          <dt>Tools</dt>
          <dd>{{ snapshot.toolCount }}</dd>
        </div>
        <div>
          <dt>PID</dt>
          <dd>{{ snapshot.pid ?? "remote" }}</dd>
        </div>
      </dl>

      <p v-if="snapshot.lastError" class="mcp-card__error">
        {{ snapshot.lastError }}
      </p>
    </button>

    <div class="mcp-card__actions">
      <button
        class="button button--ghost"
        type="button"
        :disabled="busy"
        @click="$emit('action', 'start')"
      >
        Start
      </button>
      <button
        class="button button--ghost"
        type="button"
        :disabled="busy"
        @click="$emit('action', 'stop')"
      >
        Stop
      </button>
      <button
        class="button button--ghost"
        type="button"
        :disabled="busy"
        @click="$emit('action', 'restart')"
      >
        Restart
      </button>
    </div>
  </article>
</template>
