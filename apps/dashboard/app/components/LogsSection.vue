<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { ManagedMcpSnapshot, ManagedMcpLogEntry } from '@all-in-one-mcp/contracts'
import { formatClock, formatRelativeTime } from '../utils/formatters'
import { parseLogMessage } from '../utils/log-helpers'
import { statusRatio, stoplightRatio } from '../utils/status-helpers'

type ConsoleLogRow = {
  id: number
  level: ManagedMcpLogEntry['level']
  time: string
  category: string
  message: string
}

type HealthMetric = {
  label: string
  value: string
  ratio: number
  tone: 'primary' | 'secondary' | 'tertiary'
}

type EventStreamItem = {
  id: string
  title: string
  message: string
  level: ManagedMcpLogEntry['level']
  relativeTime: string
}

const TOTAL_LOG_LIMIT = 1_000

const props = defineProps<{
  selectedSnapshot: ManagedMcpSnapshot | null
  selectedDefinition: any
  rawLogs: ManagedMcpLogEntry[]
  logs: ManagedMcpLogEntry[]
  streamPaused: boolean
  loading: boolean
  levelFilter: string
  searchQuery: string
}>()

const emit = defineEmits<{
  (e: 'update:levelFilter', value: string): void
  (e: 'update:searchQuery', value: string): void
  (e: 'toggleStream'): void
  (e: 'exportConfig'): void
}>()

const consoleBody = ref<HTMLElement | null>(null)

const filteredLogRows = computed<ConsoleLogRow[]>(() =>
  props.logs.map((entry) => {
    const parsed = parseLogMessage(entry)

    return {
      id: entry.id,
      level: entry.level,
      time: formatClock(entry.timestamp),
      category: parsed.category,
      message: parsed.message
    }
  })
)

const bufferFreePercent = computed(() => Math.max(0, 100 - Math.round((props.rawLogs.length / TOTAL_LOG_LIMIT) * 100)))

const healthMetrics = computed<HealthMetric[]>(() => {
  const totalEntries = props.rawLogs.length || 1
  const flaggedEntries = props.rawLogs.filter(e => e.level === 'warn' || e.level === 'error').length

  return [
    {
      label: 'Status',
      value: props.selectedSnapshot ? formatTitleCase(props.selectedSnapshot.status) : 'Offline',
      ratio: statusRatio(props.selectedSnapshot),
      tone: 'primary' as const
    },
    {
      label: 'Signal',
      value: `${flaggedEntries} flagged`,
      ratio: stoplightRatio(flaggedEntries / totalEntries),
      tone: 'secondary' as const
    },
    {
      label: 'Buffer',
      value: `${props.rawLogs.length}/${TOTAL_LOG_LIMIT}`,
      ratio: props.rawLogs.length / TOTAL_LOG_LIMIT,
      tone: 'tertiary' as const
    }
  ]
})

const metadataTags = computed(() => {
  if (!props.selectedDefinition) {
    return []
  }

  return [
    { label: 'service', value: props.selectedDefinition.name },
    { label: 'transport', value: props.selectedDefinition.transport },
    { label: 'prefix', value: props.selectedDefinition.toolPrefix },
    { label: 'startup', value: `${Math.round(props.selectedDefinition.startupTimeoutMs / 1_000)}s` },
    { label: 'auto', value: props.selectedDefinition.autoStart ? 'enabled' : 'manual' }
  ]
})

const eventStreamItems = computed<EventStreamItem[]>(() =>
  props.rawLogs
    .slice()
    .reverse()
    .filter((entry) => entry.level !== 'info' || entry.source === 'manager' || entry.message.startsWith('['))
    .slice(0, 4)
    .map((entry) => {
      const parsed = parseLogMessage(entry)

      return {
        id: `${entry.id}-${entry.timestamp}`,
        title: parsed.category,
        message: parsed.message,
        level: entry.level,
        relativeTime: formatRelativeTime(entry.timestamp)
      }
    })
)

watch(
  () => filteredLogRows.value.length,
  () => {
    nextTick(() => {
      if (consoleBody.value && !props.streamPaused) {
        consoleBody.value.scrollTop = consoleBody.value.scrollHeight
      }
    })
  }
)

function formatTitleCase(value: string): string {
  return value
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

const levelOptions = [
  { label: 'All Levels', value: 'all' },
  { label: 'Info', value: 'info' },
  { label: 'Debug', value: 'debug' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' }
]
</script>

<template>
  <section class="page-panel">
    <div class="page-hero">
      <div>
        <div class="page-hero__meta">
          <span class="live-badge">LIVE SESSION</span>
          <span class="page-hero__pid">{{ selectedSnapshot ? (selectedSnapshot.pid ? `PID: ${selectedSnapshot.pid}` : (selectedDefinition?.transport === 'streamable-http' ? 'Remote target' : 'Awaiting process')) : 'No session' }}</span>
        </div>

        <h2>
          LIVE LOGS
          <span v-if="selectedDefinition">/ {{ selectedDefinition.toolPrefix }}</span>
        </h2>
      </div>

      <div class="page-hero__actions">
        <button class="action-button action-button--soft" type="button" :disabled="!selectedDefinition" @click="emit('toggleStream')">
          {{ streamPaused ? 'Resume Stream' : 'Pause Stream' }}
        </button>
        <button class="action-button" type="button" :disabled="!selectedDefinition" @click="emit('exportConfig')">Export Config</button>
      </div>
    </div>

    <div v-if="loading" class="empty-console">
      <h3>Loading portal data</h3>
      <p>Connecting to the runtime and preparing the latest MCP activity.</p>
    </div>

    <div v-else-if="!selectedSnapshot" class="empty-console">
      <h3>No managed MCPs</h3>
      <p>The runtime is up, but there are no configured services to inspect yet.</p>
    </div>

    <div v-else class="console-layout">
      <section class="console-card">
        <div class="console-card__header">
          <div class="console-card__title">
            <span class="window-dot window-dot--rose" />
            <span class="window-dot window-dot--amber" />
            <span class="window-dot window-dot--teal" />
            <strong>CONSOLE OUTPUT</strong>
          </div>

          <div class="console-card__filters">
            <label class="inline-select">
              <select :value="levelFilter" @change="emit('update:levelFilter', ($event.target as HTMLSelectElement).value)">
                <option v-for="option in levelOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <span class="console-card__window">Last {{ TOTAL_LOG_LIMIT }} lines</span>
          </div>
        </div>

        <div ref="consoleBody" class="console-card__body">
          <div v-if="filteredLogRows.length === 0" class="console-empty">
            No logs match the current filters. Adjust the search or wait for the next stream event.
          </div>

          <article
            v-for="entry in filteredLogRows"
            :key="entry.id"
            class="console-row"
            :class="`is-${entry.level}`"
          >
            <time class="console-row__time">{{ entry.time }}</time>
            <span class="console-row__level">{{ entry.level }}</span>
            <div class="console-row__content">
              <strong>{{ entry.category }}</strong>
              <p>{{ entry.message }}</p>
            </div>
          </article>
        </div>

        <footer class="console-card__footer">
          <span><i class="status-dot" /> {{ streamPaused ? 'STREAM PAUSED' : 'CONNECTED' }}</span>
          <span>BUFFERS: {{ bufferFreePercent }}% FREE</span>
          <span>{{ filteredLogRows.length }} VISIBLE / {{ rawLogs.length }} TOTAL</span>
        </footer>
      </section>

      <aside class="console-sidebar">
        <section class="side-card">
          <h3>INSTANCE HEALTH</h3>

          <div v-for="metric in healthMetrics" :key="metric.label" class="meter">
            <div class="meter__copy">
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
            </div>

            <div class="meter__track">
              <span class="meter__fill" :class="`is-${metric.tone}`" :style="{ width: `${Math.round(metric.ratio * 100)}%` }" />
            </div>
          </div>
        </section>

        <section class="side-card side-card--tags">
          <h3>METADATA TAGS</h3>

          <div class="tag-cloud">
            <span v-for="tag in metadataTags" :key="tag.label" class="meta-tag">{{ tag.label }}: {{ tag.value }}</span>
          </div>
        </section>

        <section class="side-card">
          <h3>EVENT STREAM</h3>

          <div v-if="eventStreamItems.length === 0" class="side-card__empty">
            Manager notices, warnings, and errors will appear here.
          </div>

          <article
            v-for="item in eventStreamItems"
            :key="item.id"
            class="event-item"
            :class="`is-${item.level}`"
          >
            <div class="event-item__dot" />
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.message }}</p>
              <time>{{ item.relativeTime }}</time>
            </div>
          </article>
        </section>
      </aside>
    </div>
  </section>
</template>
