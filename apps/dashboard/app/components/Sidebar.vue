<script setup lang="ts">
export type PortalSection = 'logs' | 'fleet' | 'config' | 'tools'

defineProps<{
  activeSection: PortalSection
}>()

const emit = defineEmits<{
  (e: 'update:activeSection', value: PortalSection): void
}>()

const navItems = [
  { id: 'fleet' as PortalSection, label: 'Fleet', shortLabel: 'FL' },
  { id: 'config' as PortalSection, label: 'Config', shortLabel: 'CF' },
  { id: 'logs' as PortalSection, label: 'Logs', shortLabel: 'LG' },
  { id: 'tools' as PortalSection, label: 'Tools', shortLabel: 'TL' }
]
</script>

<template>
  <aside class="portal-sidebar">
    <div class="brand-card">
      <div class="brand-mark">
        <span>&gt;_</span>
      </div>

      <div>
        <h1>MCP Portal</h1>
        <p>V2.4 ACTIVE</p>
      </div>
    </div>

    <nav class="portal-nav" aria-label="Portal navigation">
      <button
        v-for="item in navItems"
        :key="item.id"
        class="portal-nav__item"
        :class="{ 'is-active': activeSection === item.id }"
        type="button"
        @click="emit('update:activeSection', item.id)"
      >
        <span class="portal-nav__icon">{{ item.shortLabel }}</span>
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div class="portal-sidebar__footer">
      <p class="portal-sidebar__caption">Local runtime control for managed MCP instances and shared tool gateways.</p>
    </div>
  </aside>
</template>
