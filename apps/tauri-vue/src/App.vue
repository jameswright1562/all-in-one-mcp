<script setup lang="ts">
import {
  DashboardRoot,
  type DashboardClient,
  type SettingsAdapter,
} from "@all-in-one-mcp/dashboard-shared";
import { createRuntimeEventSource, requestJson } from "./lib/runtimeApi";

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

const settingsAdapter: SettingsAdapter = {
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
};
</script>

<template>
  <DashboardRoot
    :client="client"
    :settings-adapter="settingsAdapter"
    :show-all-by-default="true"
  />
</template>
