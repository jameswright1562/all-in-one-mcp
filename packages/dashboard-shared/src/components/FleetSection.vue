<script setup lang="ts">
import { computed } from "vue";
import type {
  ManagedMcpSnapshot,
  ProfileDefinition,
} from "@all-in-one-mcp/contracts";

const props = defineProps<{
  items: ManagedMcpSnapshot[];
  selectedId: string | null;
  actioning: boolean;
  activeProfileId: string | null;
  profiles: ProfileDefinition[];
}>();

defineEmits<{
  select: [id: string];
  action: [id: string, action: "start" | "stop" | "restart"];
}>();

const activeProfile = computed(() =>
  props.activeProfileId
    ? (props.profiles.find((p) => p.id === props.activeProfileId) ?? null)
    : null,
);

function isMcpEnabled(mcpId: string): boolean {
  if (!activeProfile.value) return true;
  const entry = activeProfile.value.mcps.find((m) => m.mcpId === mcpId);
  return entry?.enabled ?? false;
}

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

    <div
      v-if="activeProfile"
      class="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-[rgba(212,91,58,0.28)] bg-[rgba(212,91,58,0.08)] px-4 py-3 text-sm"
    >
      <span
        class="rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--primary-strong)] px-2.5 py-1 text-[0.65rem] font-extrabold tracking-[0.08em] text-[#fff8f1]"
      >
        ACTIVE
      </span>
      <span class="font-bold">{{ activeProfile.name }}</span>
      <span class="text-[var(--muted)]">
        — MCPs not in this profile are hidden from clients
      </span>
    </div>

    <div
      v-else
      class="mb-3 rounded-2xl border border-[var(--line)] bg-[rgba(245,241,234,0.7)] px-4 py-3 text-sm text-[var(--muted)] dark:bg-white/5"
    >
      <span>No profile active — all MCPs exposed to clients</span>
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
        :class="[
          { 'is-selected': selectedId === snapshot.definition.id },
          activeProfile && !isMcpEnabled(snapshot.definition.id)
            ? 'opacity-50 hover:opacity-75'
            : '',
        ]"
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
            <div class="flex flex-wrap items-center justify-end gap-1.5">
              <span
                v-if="activeProfile && !isMcpEnabled(snapshot.definition.id)"
                class="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[0.62rem] font-extrabold tracking-[0.08em] text-red-600 dark:text-red-300"
              >
                HIDDEN
              </span>
              <span
                v-else-if="activeProfile"
                class="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[0.62rem] font-extrabold tracking-[0.08em] text-emerald-700 dark:text-emerald-300"
              >
                VISIBLE
              </span>
              <span class="fleet-card__status">{{
                titleCase(snapshot.status)
              }}</span>
            </div>
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
