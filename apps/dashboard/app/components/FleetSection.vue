<script setup lang="ts">
import type { ManagedMcpSnapshot } from "all-in-one-mcp/contracts";

defineProps<{
  items: ManagedMcpSnapshot[];
  selectedId: string | null;
  actioning: boolean;
}>();

defineEmits<{
  select: [id: string];
  action: [id: string, action: "start" | "stop" | "restart"];
}>();

function titleCase(value: string): string {
  return value
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatRelativeTime(timestamp: string): string {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(timestamp).getTime()) / 1_000),
  );

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
</script>

<template>
  <section class="page-panel">
    <div class="section-title">
      <div>
        <p>FLEET</p>
        <h2>Managed Runtime Targets</h2>
      </div>
      <span>{{ items.length }} configured</span>
    </div>

    <div v-if="items.length === 0" class="empty-console">
      <h3>No fleet members</h3>
      <p>
        Once MCP definitions are stored, their runtime cards will appear here.
      </p>
    </div>

    <div v-else class="fleet-grid">
      <article
        v-for="snapshot in items"
        :key="snapshot.definition.id"
        class="fleet-card"
        :class="{ 'is-selected': selectedId === snapshot.definition.id }"
      >
        <button
          class="fleet-card__body"
          type="button"
          @click="$emit('select', snapshot.definition.id)"
        >
          <div class="fleet-card__header">
            <div>
              <p>{{ snapshot.definition.transport }}</p>
              <h3>{{ snapshot.definition.name }}</h3>
            </div>
            <span class="fleet-card__status">{{
              titleCase(snapshot.status)
            }}</span>
          </div>

          <dl class="fleet-card__stats">
            <div>
              <dt>Prefix</dt>
              <dd>{{ snapshot.definition.toolPrefix }}</dd>
            </div>
            <div>
              <dt>Tools</dt>
              <dd>{{ snapshot.toolCount }}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{{ formatRelativeTime(snapshot.updatedAt) }}</dd>
            </div>
          </dl>

          <p v-if="snapshot.lastError" class="fleet-card__error">
            {{ snapshot.lastError }}
          </p>
        </button>

        <div class="fleet-card__actions">
          <button
            class="action-chip"
            type="button"
            :disabled="actioning"
            @click="$emit('action', snapshot.definition.id, 'start')"
          >
            Start
          </button>
          <button
            class="action-chip"
            type="button"
            :disabled="actioning"
            @click="$emit('action', snapshot.definition.id, 'stop')"
          >
            Stop
          </button>
          <button
            class="action-chip"
            type="button"
            :disabled="actioning"
            @click="$emit('action', snapshot.definition.id, 'restart')"
          >
            Restart
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
