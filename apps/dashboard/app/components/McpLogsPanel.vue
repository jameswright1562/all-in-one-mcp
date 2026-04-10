<script setup lang="ts">
import type { ManagedMcpLogEntry } from "all-in-one-mcp/contracts";

defineProps<{
  title: string;
  logs: ManagedMcpLogEntry[];
}>();
</script>

<template>
  <section class="logs-panel">
    <div class="section-heading">
      <div>
        <p class="section-heading__eyebrow">Live Logs</p>
        <h2>{{ title }}</h2>
      </div>
      <span class="section-heading__meta">{{ logs.length }} entries</span>
    </div>

    <div class="logs-panel__body">
      <div v-if="logs.length === 0" class="logs-panel__empty">
        No logs yet. Start a managed MCP to watch its runtime output.
      </div>

      <div v-for="entry in logs" :key="entry.id" class="log-row">
        <div class="log-row__meta">
          <span class="status-pill" :data-status="entry.level">{{
            entry.level
          }}</span>
          <span>{{ entry.source }}</span>
          <time>{{ new Date(entry.timestamp).toLocaleTimeString() }}</time>
        </div>
        <pre>{{ entry.message }}</pre>
      </div>
    </div>
  </section>
</template>
