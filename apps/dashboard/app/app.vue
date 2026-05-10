<script setup lang="ts">
import { $fetch } from "ofetch";
import {
  DashboardRoot,
  type DashboardClient,
} from "@all-in-one-mcp/dashboard-shared";

const client: DashboardClient = {
  fetchMcps: () => $fetch("/api/mcps"),
  fetchLogs: (mcpId, limit) =>
    $fetch(`/api/mcps/${mcpId}/logs`, {
      query: { limit },
    }),
  createEventSource: () => new EventSource("/api/events"),
  mutateMcp: (id, action) =>
    $fetch(`/api/mcps/${id}/${action}`, {
      method: "POST",
    }),
  createDefinition: (definition) =>
    $fetch("/api/mcps", {
      method: "POST",
      body: definition,
    }),
  updateDefinition: (id, definition) =>
    $fetch(`/api/mcps/${id}`, {
      method: "PATCH",
      body: definition,
    }),
  fetchProfiles: () => $fetch("/api/profiles"),
  createProfile: (profile) =>
    $fetch("/api/profiles", {
      method: "POST",
      body: profile,
    }),
  updateProfile: (id, profile) =>
    $fetch(`/api/profiles/${id}`, {
      method: "PATCH",
      body: profile,
    }),
  deleteProfile: async (id) => {
    await $fetch(`/api/profiles/${id}`, {
      method: "DELETE",
    });
  },
  activateProfile: async (id) => {
    await $fetch(`/api/profiles/${id}/activate`, {
      method: "POST",
    });
  },
  deactivateProfile: async () => {
    await $fetch("/api/profiles/deactivate", {
      method: "POST",
    });
  },
};
</script>

<template>
  <DashboardRoot :client="client" />
</template>
