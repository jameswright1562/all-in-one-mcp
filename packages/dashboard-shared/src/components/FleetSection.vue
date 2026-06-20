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

    <div v-if="activeProfile" class="profile-active-bar">
      <span class="profile-active-bar__badge">ACTIVE</span>
      <span class="profile-active-bar__name">{{ activeProfile.name }}</span>
      <span class="profile-active-bar__hint">
        — MCPs not in this profile are hidden from clients
      </span>
    </div>

    <div v-else class="profile-inactive-bar">
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
        :class="{
          'is-selected': selectedId === snapshot.definition.id,
          'is-profile-excluded':
            activeProfile && !isMcpEnabled(snapshot.definition.id),
        }"
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
            <div class="fleet-card__status-group">
              <span
                v-if="activeProfile && !isMcpEnabled(snapshot.definition.id)"
                class="fleet-card__profile-badge fleet-card__profile-badge--disabled"
              >
                HIDDEN
              </span>
              <span
                v-else-if="activeProfile"
                class="fleet-card__profile-badge fleet-card__profile-badge--enabled"
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

<style scoped>
.profile-active-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  border-radius: 6px;
  background: var(--color-accent-dim, rgba(108, 92, 231, 0.12));
  border: 1px solid var(--color-accent, #6c5ce7);
  font-size: 0.82rem;
}

.profile-active-bar__badge {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--color-accent, #6c5ce7);
  color: #fff;
}

.profile-active-bar__name {
  font-weight: 600;
}

.profile-active-bar__hint {
  color: var(--color-text-tertiary, #666);
}

.profile-inactive-bar {
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  border-radius: 6px;
  background: var(--color-surface, #1a1a1a);
  border: 1px solid var(--color-border, #333);
  font-size: 0.82rem;
  color: var(--color-text-tertiary, #666);
}

.fleet-card__status-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.fleet-card__profile-badge {
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 1px 5px;
  border-radius: 3px;
}

.fleet-card__profile-badge--enabled {
  background: rgba(46, 204, 113, 0.18);
  color: #2ecc71;
  border: 1px solid rgba(46, 204, 113, 0.35);
}

.fleet-card__profile-badge--disabled {
  background: rgba(231, 76, 60, 0.18);
  color: #e74c3c;
  border: 1px solid rgba(231, 76, 60, 0.35);
}

.is-profile-excluded {
  opacity: 0.5;
  border-color: var(--color-border, #333);
}

.is-profile-excluded:hover {
  opacity: 0.75;
}
</style>
