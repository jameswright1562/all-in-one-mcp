<script setup lang="ts">
import type { NavItem, PortalSection } from "../types/dashboard";

defineProps<{
  activeSection: PortalSection;
  navItems: NavItem[];
  caption: string;
}>();

defineEmits<{
  navigate: [section: PortalSection];
}>();
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
        @click="$emit('navigate', item.id)"
      >
        <span class="portal-nav__icon">{{ item.shortLabel }}</span>
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div class="portal-sidebar__footer">
      <p class="portal-sidebar__caption">{{ caption }}</p>
    </div>
  </aside>
</template>
