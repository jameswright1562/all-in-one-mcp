<script setup lang="ts">
import type { ManagedMcpSnapshot } from '@all-in-one-mcp/contracts'

defineProps<{
  items: ManagedMcpSnapshot[]
  selectedId: string | null
  themeMode: 'light' | 'dark'
}>()

const emit = defineEmits<{
  (e: 'update:selectedId', value: string): void
  (e: 'toggleTheme'): void
}>()

function handleServiceChange(event: Event): void {
  const nextId = (event.target as HTMLSelectElement).value
  if (nextId) {
    emit('update:selectedId', nextId)
  }
}
</script>

<template>
  <header class="portal-topbar">
    <div class="portal-topbar__headline">
      <p>MCP COMMAND</p>

      <div class="service-switch" :class="{ 'is-empty': items.length === 0 }">
        <span class="service-switch__dot" />
        <select :value="selectedId ?? ''" :disabled="items.length === 0" @change="handleServiceChange">
          <option v-if="items.length === 0" value="">No active service</option>
          <option v-for="item in items" :key="item.definition.id" :value="item.definition.id">
            {{ item.definition.toolPrefix }}.service
          </option>
        </select>
      </div>
    </div>

    <div class="portal-topbar__controls">
      <slot name="search" />

      <button class="theme-toggle" type="button" @click="emit('toggleTheme')">
        {{ themeMode === 'dark' ? 'Light Mode' : 'Dark Mode' }}
      </button>

      <div class="profile-avatar" aria-hidden="true">{{ items.length }} MCP</div>
    </div>
  </header>
</template>
