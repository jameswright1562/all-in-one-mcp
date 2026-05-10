<script setup lang="ts">
import type { ManagedMcpSnapshot } from '@all-in-one-mcp/contracts'
import { formatRelativeTime } from '../utils/formatters'
import { titleCase } from '../utils/formatters'

defineProps<{
  items: ManagedMcpSnapshot[]
  selectedId: string | null
  actioning: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'invokeAction', id: string, action: 'start' | 'stop' | 'restart'): void
  (e: 'delete', id: string): void
}>()
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
      <p>Once MCP definitions are stored, their runtime cards will appear here.</p>
    </div>

    <div v-else class="fleet-grid">
      <article
        v-for="snapshot in items"
        :key="snapshot.definition.id"
        class="fleet-card"
        :class="{ 'is-selected': selectedId === snapshot.definition.id }"
      >
        <button class="fleet-card__body" type="button" @click="emit('select', snapshot.definition.id)">
          <div class="fleet-card__header">
            <div>
              <p>{{ snapshot.definition.transport }}</p>
              <h3>{{ snapshot.definition.name }}</h3>
            </div>
            <span class="fleet-card__status">{{ titleCase(snapshot.status) }}</span>
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

          <p v-if="snapshot.lastError" class="fleet-card__error">{{ snapshot.lastError }}</p>
        </button>

        <div class="fleet-card__actions">
          <button class="action-chip" type="button" :disabled="actioning" @click="emit('invokeAction', snapshot.definition.id, 'start')">Start</button>
          <button class="action-chip" type="button" :disabled="actioning" @click="emit('invokeAction', snapshot.definition.id, 'stop')">Stop</button>
          <button class="action-chip" type="button" :disabled="actioning" @click="emit('invokeAction', snapshot.definition.id, 'restart')">Restart</button>
          <button class="action-chip action-chip--danger" type="button" :disabled="saving" @click="emit('delete', snapshot.definition.id)">Delete</button>
        </div>
      </article>
    </div>
  </section>
</template>
