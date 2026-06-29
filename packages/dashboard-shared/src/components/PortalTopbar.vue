<script setup lang="ts">
import type { PortalSection } from "../types/dashboard";
import type {
  ManagedMcpSnapshot,
  ProfileDefinition,
} from "@all-in-one-mcp/contracts";

const searchQuery = defineModel<string>("searchQuery", { default: "" });

defineProps<{
  activeSection: PortalSection;
  items: ManagedMcpSnapshot[];
  selectedId: string | null;
  themeMode: "light" | "dark";
  profiles: ProfileDefinition[];
  activeProfileId: string | null;
}>();

defineEmits<{
  (e: "select-service", id: string): void;
  (e: "select-profile", id: string): void;
  (e: "toggle-theme"): void;
}>();
</script>

<template>
  <header class="portal-topbar">
    <div class="portal-topbar__headline">
      <p>MCP COMMAND</p>

      <div class="service-switch" :class="{ 'is-empty': items.length === 0 }">
        <span class="service-switch__dot" />
        <select
          :value="selectedId ?? ''"
          :disabled="items.length === 0"
          @change="
            $emit('select-service', ($event.target as HTMLSelectElement).value)
          "
        >
          <option value="">All Services</option>
          <option
            v-for="item in items"
            :key="item.definition.id"
            :value="item.definition.id"
          >
            {{ item.definition.toolPrefix }}.service
          </option>
        </select>
      </div>

      <div v-if="items.length > 0" class="service-switch__summary">
        <span v-for="item in items" :key="item.definition.id">
          {{ item.definition.toolPrefix }}.service
        </span>
      </div>
    </div>

    <div class="portal-topbar__controls">
      <label v-if="activeSection === 'logs'" class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M15.8 15.8 21 21M10.4 17.2a6.8 6.8 0 1 1 0-13.6 6.8 6.8 0 0 1 0 13.6Z"
          />
        </svg>
        <input
          v-model="searchQuery"
          placeholder="Search logs..."
          type="search"
        />
      </label>

      <div
        class="inline-flex min-h-12 min-w-48 items-center gap-3 rounded-full border border-[var(--line)] bg-white/70 px-4 shadow-inner dark:bg-white/5"
      >
        <span
          class="size-2.5 rounded-full bg-[var(--primary)] shadow-[0_0_0_4px_rgba(212,91,58,0.12)]"
        />
        <select
          class="min-w-0 flex-1 bg-transparent font-semibold text-[#352e2a] outline-none dark:text-[#f2e7e0]"
          :value="activeProfileId ?? ''"
          @change="
            $emit('select-profile', ($event.target as HTMLSelectElement).value)
          "
        >
          <option value="">All MCPs</option>
          <option
            v-for="profile in profiles"
            :key="profile.id"
            :value="profile.id"
          >
            {{ profile.name }} profile
          </option>
        </select>
      </div>

      <button class="theme-toggle" type="button" @click="$emit('toggle-theme')">
        {{ themeMode === "dark" ? "Light Mode" : "Dark Mode" }}
      </button>

      <div class="profile-avatar" aria-hidden="true">
        {{ items.length }} MCP
      </div>
    </div>
  </header>
</template>
