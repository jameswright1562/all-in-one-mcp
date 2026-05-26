<script setup lang="ts">
import { ref } from "vue";
import {
  DashboardRoot,
  type DashboardClient,
  type SettingsAdapter,
} from "@all-in-one-mcp/dashboard-shared";
import RuntimeSplash from "./components/RuntimeSplash.vue";
import { desktopAdapter } from "./lib/desktop";
import { createRuntimeEventSource, requestJson } from "./lib/runtimeApi";

const runtimeReady = ref(false);
const runtimeError = ref("");

const client: DashboardClient = {
  fetchMcps: () =>
    requestJson("/api/mcps", {
      method: "GET",
    }),
  fetchLogs: (mcpId, limit) =>
    requestJson(
      `/api/mcps/${mcpId}/logs`,
      {
        method: "GET",
      },
      { limit },
    ),
  createEventSource: () => createRuntimeEventSource("/api/events"),
  mutateMcp: (id, action) =>
    requestJson(`/api/mcps/${id}/${action}`, {
      method: "POST",
    }),
  createDefinition: (definition) =>
    requestJson("/api/mcps", {
      method: "POST",
      body: JSON.stringify(definition),
    }),
  updateDefinition: (id, definition) =>
    requestJson(`/api/mcps/${id}`, {
      method: "PATCH",
      body: JSON.stringify(definition),
    }),
  fetchProfiles: () =>
    requestJson("/api/profiles", {
      method: "GET",
    }),
  createProfile: (profile) =>
    requestJson("/api/profiles", {
      method: "POST",
      body: JSON.stringify(profile),
    }),
  updateProfile: (id, profile) =>
    requestJson(`/api/profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(profile),
    }),
  deleteProfile: async (id) => {
    await requestJson(`/api/profiles/${id}`, {
      method: "DELETE",
    });
  },
  activateProfile: async (id) => {
    await requestJson(`/api/profiles/${id}/activate`, {
      method: "POST",
    });
  },
  deactivateProfile: async () => {
    await requestJson("/api/profiles/deactivate", {
      method: "POST",
    });
  },
};

const settingsAdapter: SettingsAdapter | null = import.meta.env.PROD
  ? {
      title: "Launch on startup",
      description:
        "Automatically start the desktop app when you log into your system.",
      async isEnabled() {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        return isEnabled();
      },
      async setEnabled(enabled) {
        const { enable, disable } = await import("@tauri-apps/plugin-autostart");
        if (enabled) {
          await enable();
          return;
        }

        await disable();
      },
    }
  : null;

function handleRuntimeReady(): void {
  runtimeError.value = "";
  runtimeReady.value = true;
}

function handleRuntimeFailed(message: string): void {
  runtimeError.value = message;
}
</script>

<template>
  <RuntimeSplash
    v-if="!runtimeReady && !runtimeError"
    @ready="handleRuntimeReady"
    @failed="handleRuntimeFailed"
  />

  <section v-else-if="runtimeError" class="runtime-error">
    <h1>Runtime unavailable</h1>
    <p>{{ runtimeError }}</p>
    <button type="button" @click="desktopAdapter.openLogsFolder()">
      Open runtime logs
    </button>
  </section>

  <DashboardRoot
    v-else
    :client="client"
    :desktop-adapter="desktopAdapter"
    :settings-adapter="settingsAdapter"
    :show-all-by-default="true"
  />
</template>

<style scoped>
.runtime-error {
  display: grid;
  min-height: 100vh;
  place-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}

.runtime-error h1 {
  margin: 0;
}

.runtime-error p {
  margin: 0;
  color: #64748b;
}

.runtime-error button {
  justify-self: center;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #0f172a;
  color: #f8fafc;
  padding: 10px 16px;
  cursor: pointer;
}
</style>
