<script setup lang="ts">
import type {
  ConsoleLogRow,
  EventStreamItem,
  HealthMetric,
  MetadataTag,
  ManagedMcpDefinition,
  ManagedMcpSnapshot,
  LevelOption,
} from "../types/dashboard";

const {
  loading,
  selectedSnapshot,
  selectedDefinition,
  selectedPidLabel,
  streamPaused,
  bufferFreePercent,
  filteredLogRows,
  healthMetrics,
  metadataTags,
  eventStreamItems,
  rawLogsLength,
  totalLogLimit,
  levelOptions,
} = defineProps<{
  loading: boolean;
  selectedSnapshot: ManagedMcpSnapshot | null;
  selectedDefinition: ManagedMcpDefinition | null;
  selectedPidLabel: string;
  streamPaused: boolean;
  bufferFreePercent: number;
  filteredLogRows: ConsoleLogRow[];
  healthMetrics: HealthMetric[];
  metadataTags: MetadataTag[];
  eventStreamItems: EventStreamItem[];
  rawLogsLength: number;
  totalLogLimit: number;
  levelOptions: LevelOption[];
}>();

const logsRef = useTemplateRef<HTMLDivElement>("logs");

const levelFilter = defineModel<"all" | ConsoleLogRow["level"]>("levelFilter", {
  default: "all",
});

defineEmits<{
  (e: "toggle-stream"): void;
  (e: "export-config"): void;
}>();

watch(
  () => filteredLogRows.length,
  () => {
    logsRef.value?.scrollTo(0, logsRef.value.scrollHeight);
  },
);
</script>

<template>
  <section class="page-panel">
    <div class="page-hero">
      <div>
        <div class="page-hero__meta">
          <span class="live-badge">LIVE SESSION</span>
          <span class="page-hero__pid">{{ selectedPidLabel }}</span>
        </div>

        <h2>
          LIVE LOGS
          <span v-if="selectedDefinition"
            >/ {{ selectedDefinition.toolPrefix }}</span
          >
        </h2>
      </div>

      <div class="page-hero__actions">
        <button
          class="action-button action-button--soft"
          type="button"
          :disabled="!selectedDefinition"
          @click="$emit('toggle-stream')"
        >
          {{ streamPaused ? "Resume Stream" : "Pause Stream" }}
        </button>
        <button
          class="action-button"
          type="button"
          :disabled="!selectedDefinition"
          @click="$emit('export-config')"
        >
          Export Config
        </button>
      </div>
    </div>

    <div v-if="loading" class="empty-console">
      <h3>Loading portal data</h3>
      <p>Connecting to the runtime and preparing the latest MCP activity.</p>
    </div>

    <div v-else-if="!selectedSnapshot" class="empty-console">
      <h3>No managed MCPs</h3>
      <p>
        The runtime is up, but there are no configured services to inspect yet.
      </p>
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
              <select v-model="levelFilter">
                <option
                  v-for="option in levelOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <span class="console-card__window"
              >Last {{ totalLogLimit }} lines</span
            >
          </div>
        </div>

        <div class="console-card__body" ref="logs">
          <div v-if="filteredLogRows.length === 0" class="console-empty">
            No logs match the current filters. Adjust the search or wait for the
            next stream event.
          </div>

          <article
            v-for="entry in filteredLogRows"
            :key="entry.id"
            class="console-row"
            :class="[`is-${entry.level}`]"
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
          <span
            ><i class="status-dot" />
            {{ streamPaused ? "STREAM PAUSED" : "CONNECTED" }}</span
          >
          <span>BUFFERS: {{ bufferFreePercent }}% FREE</span>
          <span
            >{{ filteredLogRows.length }} VISIBLE /
            {{ rawLogsLength }} TOTAL</span
          >
        </footer>
      </section>

      <aside class="console-sidebar">
        <section class="side-card">
          <h3>INSTANCE HEALTH</h3>

          <div
            v-for="metric in healthMetrics"
            :key="metric.label"
            class="meter"
          >
            <div class="meter__copy">
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
            </div>

            <div class="meter__track">
              <span
                class="meter__fill"
                :class="`is-${metric.tone}`"
                :style="{ width: `${Math.round(metric.ratio * 100)}%` }"
              />
            </div>
          </div>
        </section>

        <section class="side-card side-card--tags">
          <h3>METADATA TAGS</h3>

          <div class="tag-cloud">
            <span v-for="tag in metadataTags" :key="tag.label" class="meta-tag"
              >{{ tag.label }}: {{ tag.value }}</span
            >
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
            :class="[`is-${item.level}`]"
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
