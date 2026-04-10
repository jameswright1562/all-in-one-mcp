<script setup lang="ts">
import type { ManagedMcpDefinition } from "all-in-one-mcp/contracts";

defineProps<{
  selectedTools: Array<{
    name: string;
    upstreamName: string;
    title?: string;
    description?: string;
  }>;
  selectedDefinition: ManagedMcpDefinition | null;
}>();
</script>

<template>
  <section class="page-panel">
    <div class="section-title">
      <div>
        <p>TOOLS</p>
        <h2>Registered Tool Catalog</h2>
      </div>
      <span>{{ selectedTools.length }} tools exposed</span>
    </div>

    <div v-if="selectedTools.length === 0" class="empty-console">
      <h3>No tools discovered</h3>
      <p>
        Start the selected MCP and its exposed tool catalog will be listed here.
      </p>
    </div>

    <div v-else class="tool-grid">
      <article v-for="tool in selectedTools" :key="tool.name" class="tool-card">
        <div class="tool-card__top">
          <p>{{ tool.upstreamName }}</p>
          <span class="tool-card__badge">{{
            tool.title || "Untitled tool"
          }}</span>
        </div>

        <h3>{{ tool.name }}</h3>
        <p class="tool-card__description">
          {{
            tool.description || "No description provided by the upstream MCP."
          }}
        </p>

        <footer class="tool-card__footer">
          <span>{{ selectedDefinition?.transport || "runtime" }}</span>
          <span>{{ selectedDefinition?.toolPrefix || "shared" }}</span>
        </footer>
      </article>
    </div>
  </section>
</template>
