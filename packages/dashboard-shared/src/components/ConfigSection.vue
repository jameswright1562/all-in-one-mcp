<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import type {
  ConfigMode,
  FormState,
  ManagedMcpDefinition,
  ManagedMcpSnapshot,
} from "../types/dashboard";

defineProps<{
  configMode: ConfigMode;
  selectedDefinition: ManagedMcpDefinition | null;
  selectedSnapshot: ManagedMcpSnapshot | null;
  createForm: FormState;
  createErrors: Record<string, string>;
  createNotice: string;
  saving: boolean;
  logsLength: number;
  configPreview: string;
}>();

defineEmits<{
  (e: "mode-change", mode: ConfigMode): void;
  (e: "transport-change", transport: ManagedMcpDefinition["transport"]): void;
  (e: "submit"): void;
  (e: "reset"): void;
  (e: "export-config"): void;
  (e: "id-input", value: string): void;
  (e: "name-input", value: string): void;
  (e: "clear-error", field: string): void;
}>();
</script>

<template>
  <section class="page-panel">
    <div class="section-title">
      <div>
        <p>CONFIG</p>
        <h2>
          {{ configMode === "edit" ? "Edit Managed MCP" : "Add Managed MCP" }}
        </h2>
      </div>
      <span>{{
        configMode === "edit"
          ? selectedDefinition
            ? `Editing ${selectedDefinition.name}`
            : "Select an MCP to edit"
          : "Create a runtime target with validation."
      }}</span>
    </div>

    <div class="config-layout">
      <section class="config-card config-card--form">
        <div class="config-card__modebar">
          <div>
            <h3>Connection Setup</h3>
            <p class="config-card__subcopy">
              {{
                configMode === "edit"
                  ? "The form is prefilled from the selected MCP in the service switch."
                  : "Create a new MCP definition and add it to the runtime fleet."
              }}
            </p>
          </div>

          <div
            class="segmented-control segmented-control--mode"
            role="tablist"
            aria-label="Configuration mode"
          >
            <button
              class="segmented-control__option"
              :class="{ 'is-active': configMode === 'create' }"
              type="button"
              @click="$emit('mode-change', 'create')"
            >
              Create New
            </button>
            <button
              class="segmented-control__option"
              :class="{ 'is-active': configMode === 'edit' }"
              :disabled="!selectedDefinition"
              type="button"
              @click="$emit('mode-change', 'edit')"
            >
              Edit Selected
            </button>
          </div>
        </div>

        <div
          v-if="configMode === 'edit'"
          class="selection-banner"
          :class="{ 'is-empty': !selectedDefinition }"
        >
          <template v-if="selectedDefinition">
            <strong>{{ selectedDefinition.name }}</strong>
            <span>{{ selectedDefinition.id }}</span>
            <span>{{ selectedDefinition.transport }}</span>
          </template>
          <template v-else>
            <strong>No MCP selected</strong>
            <span
              >Choose one from the service switch to edit its definition.</span
            >
          </template>
        </div>

        <form class="mcp-form" @submit.prevent="$emit('submit')">
          <div class="mcp-form__grid">
            <label class="field">
              <span>MCP ID</span>
              <input
                :value="createForm.id"
                autocomplete="off"
                :disabled="configMode === 'edit'"
                placeholder="playwright"
                @input="
                  $emit('id-input', ($event.target as HTMLInputElement).value)
                "
              />
              <small>{{
                configMode === "edit"
                  ? "MCP IDs are fixed after creation."
                  : "Letters, numbers, dashes, and underscores only."
              }}</small>
              <em v-if="createErrors.id">{{ createErrors.id }}</em>
            </label>

            <label class="field">
              <span>Name</span>
              <input
                :value="createForm.name"
                autocomplete="off"
                placeholder="Playwright MCP"
                @input="
                  $emit('name-input', ($event.target as HTMLInputElement).value)
                "
              />
              <small>Human-readable label for the fleet and logs views.</small>
              <em v-if="createErrors.name">{{ createErrors.name }}</em>
            </label>

            <label class="field">
              <span>Tool Prefix</span>
              <input
                v-model="createForm.toolPrefix"
                autocomplete="off"
                placeholder="playwright"
                @input="$emit('clear-error', 'toolPrefix')"
              />
              <small>Used as the shared namespace for exposed tools.</small>
              <em v-if="createErrors.toolPrefix">{{
                createErrors.toolPrefix
              }}</em>
            </label>

            <label class="field">
              <span>Startup Timeout</span>
              <input
                v-model.number="createForm.startupTimeoutMs"
                min="1"
                step="1000"
                type="number"
                @input="$emit('clear-error', 'startupTimeoutMs')"
              />
              <small
                >Milliseconds to wait before startup is considered
                failed.</small
              >
              <em v-if="createErrors.startupTimeoutMs">{{
                createErrors.startupTimeoutMs
              }}</em>
            </label>
          </div>

          <div class="field">
            <span>Transport</span>
            <div
              class="segmented-control"
              role="radiogroup"
              aria-label="Transport selection"
            >
              <button
                class="segmented-control__option"
                :class="{ 'is-active': createForm.transport === 'stdio' }"
                type="button"
                @click="$emit('transport-change', 'stdio')"
              >
                stdio
              </button>
              <button
                class="segmented-control__option"
                :class="{
                  'is-active': createForm.transport === 'streamable-http',
                }"
                type="button"
                @click="$emit('transport-change', 'streamable-http')"
              >
                streamable-http
              </button>
            </div>
            <em v-if="createErrors.transport">{{ createErrors.transport }}</em>
          </div>

          <div v-if="createForm.transport === 'stdio'" class="mcp-form__stack">
            <label class="field">
              <span>Command</span>
              <input
                v-model="createForm.command"
                autocomplete="off"
                placeholder="npx"
                @input="$emit('clear-error', 'command')"
              />
              <small>The executable used to launch the MCP process.</small>
              <em v-if="createErrors.command">{{ createErrors.command }}</em>
            </label>

            <label class="field">
              <span>Arguments</span>
              <textarea
                v-model="createForm.argsText"
                placeholder="-y&#10;@modelcontextprotocol/server-playwright"
                rows="5"
              />
              <small>One argument per line for clean parsing and review.</small>
            </label>

            <label class="field">
              <span>Working Directory</span>
              <input
                v-model="createForm.cwd"
                autocomplete="off"
                placeholder="C:\\tools\\mcp"
              />
              <small
                >Optional. Leave empty to use the runtime working
                directory.</small
              >
            </label>
          </div>

          <div v-else class="mcp-form__stack">
            <label class="field">
              <span>Service URL</span>
              <input
                v-model="createForm.url"
                autocomplete="off"
                placeholder="http://127.0.0.1:4100/mcp"
                @input="$emit('clear-error', 'url')"
              />
              <small>Full streamable HTTP endpoint for the upstream MCP.</small>
              <em v-if="createErrors.url">{{ createErrors.url }}</em>
            </label>
          </div>

          <div class="toggle-group">
            <label class="toggle-card">
              <input v-model="createForm.enabled" type="checkbox" />
              <span>Enabled</span>
              <small>Registers the target with the runtime immediately.</small>
            </label>

            <label class="toggle-card">
              <input v-model="createForm.autoStart" type="checkbox" />
              <span>Auto-start</span>
              <small>Starts the MCP automatically after creation.</small>
            </label>
          </div>

          <p v-if="createErrors.form" class="form-banner form-banner--error">
            {{ createErrors.form }}
          </p>
          <p v-else-if="createNotice" class="form-banner form-banner--success">
            {{ createNotice }}
          </p>

          <div class="mcp-form__actions">
            <button
              class="action-button"
              type="submit"
              :disabled="
                saving || (configMode === 'edit' && !selectedDefinition)
              "
            >
              {{
                saving
                  ? configMode === "edit"
                    ? "Saving..."
                    : "Creating..."
                  : configMode === "edit"
                    ? "Save Changes"
                    : "Add MCP"
              }}
            </button>
            <button
              class="action-button action-button--soft"
              type="button"
              :disabled="saving"
              @click="$emit('reset')"
            >
              {{ configMode === "edit" ? "Reset Changes" : "Reset Form" }}
            </button>
          </div>
        </form>
      </section>

      <section class="config-card">
        <h3>Selected Runtime Definition</h3>

        <div v-if="!selectedDefinition" class="config-card__empty">
          Select an MCP from the service switch after creation to inspect its
          stored runtime definition.
        </div>

        <template v-else>
          <dl class="config-meta">
            <div>
              <dt>Status</dt>
              <dd>
                {{ selectedSnapshot ? selectedSnapshot.status : "stopped" }}
              </dd>
            </div>
            <div>
              <dt>PID</dt>
              <dd>{{ selectedSnapshot?.pid ?? "remote" }}</dd>
            </div>
            <div>
              <dt>Last Update</dt>
              <dd>
                {{
                  selectedSnapshot
                    ? new Date(selectedSnapshot.updatedAt).toLocaleString()
                    : "N/A"
                }}
              </dd>
            </div>
            <div>
              <dt>Visible Logs</dt>
              <dd>{{ logsLength }}</dd>
            </div>
          </dl>

          <div class="config-card__actions">
            <button
              class="action-button"
              type="button"
              @click="$emit('export-config')"
            >
              Export Config
            </button>
          </div>

          <pre>{{ configPreview }}</pre>
        </template>
      </section>
    </div>
  </section>
</template>
