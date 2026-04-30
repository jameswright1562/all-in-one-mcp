<script setup lang="ts">
import type { ManagedMcpSnapshot } from '@all-in-one-mcp/contracts'

defineProps<{
  tools: Array<{ name: string; upstreamName: string; title?: string; description?: string; disabled: boolean }>
  selectedDefinition: any
}>()

const emit = defineEmits<{
  (e: 'toggleTool', upstreamName: string): void
}>()
</script>

<template>
  <section class="page-panel">
    <div class="section-title">
      <div>
        <p>TOOLS</p>
        <h2>Registered Tool Catalog</h2>
      </div>
      <span>{{ tools.filter(t => !t.disabled).length }} tools exposed</span>
    </div>

    <div v-if="tools.length === 0" class="empty-console">
      <h3>No tools discovered</h3>
      <p>Start the selected MCP and its exposed tool catalog will be listed here.</p>
    </div>

    <div v-else class="tool-grid">
      <article v-for="tool in tools" :key="tool.name" class="tool-card" :class="{ 'is-disabled': tool.disabled }">
        <div class="tool-card__top">
          <p>{{ tool.upstreamName }}</p>
          <span class="tool-card__badge">{{ tool.title || 'Untitled tool' }}</span>
        </div>

        <h3>{{ tool.name }}</h3>
        <p class="tool-card__description">{{ tool.description || 'No description provided by the upstream MCP.' }}</p>

        <footer class="tool-card__footer">
          <span>{{ selectedDefinition?.transport || 'runtime' }}</span>
          <button
            class="tool-card__toggle"
            :class="{ 'is-disabled': !tool.disabled }"
            type="button"
            @click="emit('toggleTool', tool.upstreamName)"
          >
            {{ tool.disabled ? 'Enable' : 'Disable' }}
          </button>
        </footer>
      </article>
    </div>
  </section>
</template>
