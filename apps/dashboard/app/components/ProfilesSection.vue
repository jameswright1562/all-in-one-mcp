<script setup lang="ts">
import type {
  ProfileDefinition,
  ProfileMcpEntry,
  ManagedMcpSnapshot,
} from "all-in-one-mcp/contracts";

const props = defineProps<{
  profiles: ProfileDefinition[];
  activeProfileId: string | null;
  items: ManagedMcpSnapshot[];
  saving: boolean;
}>();

const emit = defineEmits<{
  create: [profile: ProfileDefinition];
  update: [id: string, profile: ProfileDefinition];
  delete: [id: string];
  activate: [id: string];
  deactivate: [];
}>();

type McpFormEntry = {
  mcpId: string;
  mcpName: string;
  enabled: boolean;
  allTools: boolean;
  selectedTools: Set<string>;
  availableTools: string[];
};

const mode = ref<"list" | "create" | "edit">("list");
const editingId = ref<string | null>(null);
const formId = ref("");
const formName = ref("");
const formDescription = ref("");
const formMcps = ref<McpFormEntry[]>([]);
const formErrors = ref<Record<string, string>>({});
const notice = ref("");

function resetForm(): void {
  formId.value = "";
  formName.value = "";
  formDescription.value = "";
  formErrors.value = {};
  notice.value = "";

  formMcps.value = props.items.map((snapshot) => ({
    mcpId: snapshot.definition.id,
    mcpName: snapshot.definition.name,
    enabled: false,
    allTools: true,
    selectedTools: new Set<string>(),
    availableTools: snapshot.tools.map((t) => t.upstreamName),
  }));
}

function startCreate(): void {
  mode.value = "create";
  editingId.value = null;
  resetForm();
}

function startEdit(profile: ProfileDefinition): void {
  mode.value = "edit";
  editingId.value = profile.id;
  formId.value = profile.id;
  formName.value = profile.name;
  formDescription.value = profile.description;
  notice.value = "";
  formErrors.value = {};

  const mcpEntryMap = new Map(
    profile.mcps.map((entry) => [entry.mcpId, entry]),
  );

  formMcps.value = props.items.map((snapshot) => {
    const entry = mcpEntryMap.get(snapshot.definition.id);
    return {
      mcpId: snapshot.definition.id,
      mcpName: snapshot.definition.name,
      enabled: entry?.enabled ?? false,
      allTools: !entry?.tools.length,
      selectedTools: new Set(entry?.tools ?? []),
      availableTools: snapshot.tools.map((t) => t.upstreamName),
    };
  });
}

function cancelForm(): void {
  mode.value = "list";
  editingId.value = null;
}

function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function buildProfile(): ProfileDefinition | null {
  const errors: Record<string, string> = {};
  const id =
    mode.value === "edit"
      ? editingId.value!
      : normalizeIdentifier(formId.value);
  const name = formName.value.trim();

  if (!id) errors.id = "ID is required.";
  if (!name) errors.name = "Name is required.";

  if (Object.keys(errors).length) {
    formErrors.value = errors;
    return null;
  }

  const mcps: ProfileMcpEntry[] = formMcps.value
    .filter((entry) => entry.enabled)
    .map((entry) => ({
      mcpId: entry.mcpId,
      enabled: true,
      tools: entry.allTools ? [] : [...entry.selectedTools],
    }));

  return {
    id,
    name,
    description: formDescription.value.trim(),
    mcps,
  };
}

async function submitForm(): Promise<void> {
  notice.value = "";
  const profile = buildProfile();
  if (!profile) return;

  try {
    if (mode.value === "edit" && editingId.value) {
      emit("update", editingId.value, profile);
      notice.value = `Profile "${profile.name}" updated.`;
    } else {
      emit("create", profile);
      notice.value = `Profile "${profile.name}" created.`;
      resetForm();
    }
    mode.value = "list";
  } catch (error) {
    formErrors.value = {
      form: error instanceof Error ? error.message : "Failed to save profile.",
    };
  }
}

function toggleTool(entry: McpFormEntry, toolName: string): void {
  if (entry.selectedTools.has(toolName)) {
    entry.selectedTools.delete(toolName);
  } else {
    entry.selectedTools.add(toolName);
  }
}

function toolCountDisplay(
  sum: number | string,
  m: ProfileMcpEntry,
): number | string {
  if (!m.enabled) return sum;
  if (!m.tools.length) return "all";
  return sum === "all" ? "all" : (sum as number) + m.tools.length;
}
</script>

<template>
  <BaseSection title="Profiles" header="Manage tool exposure profiles">
    <!-- LIST VIEW -->
    <template v-if="mode === 'list'">
      <div class="profiles-toolbar">
        <button class="btn btn--primary" type="button" @click="startCreate">
          + New Profile
        </button>

        <button
          v-if="activeProfileId"
          class="btn btn--ghost"
          type="button"
          @click="$emit('deactivate')"
        >
          Deactivate Profile
        </button>
      </div>

      <p v-if="!profiles.length" class="profiles-empty">
        No profiles created yet. Create one to control which MCPs and tools are
        exposed.
      </p>

      <div v-else class="profiles-grid">
        <div
          v-for="profile in profiles"
          :key="profile.id"
          class="profile-card"
          :class="{ 'is-active': activeProfileId === profile.id }"
        >
          <div class="profile-card__header">
            <h3>{{ profile.name }}</h3>
            <span
              v-if="activeProfileId === profile.id"
              class="profile-badge profile-badge--active"
            >
              ACTIVE
            </span>
          </div>

          <p v-if="profile.description" class="profile-card__description">
            {{ profile.description }}
          </p>

          <div class="profile-card__meta">
            <span>{{ profile.mcps.filter((m) => m.enabled).length }} MCPs</span>
            <span>·</span>
            <span>
              {{ profile.mcps.reduce(toolCountDisplay, 0) }}
              tools
            </span>
          </div>

          <div class="profile-card__actions">
            <button
              v-if="activeProfileId !== profile.id"
              class="btn btn--sm btn--primary"
              type="button"
              @click="$emit('activate', profile.id)"
            >
              Activate
            </button>
            <button
              class="btn btn--sm btn--ghost"
              type="button"
              @click="startEdit(profile)"
            >
              Edit
            </button>
            <button
              class="btn btn--sm btn--danger"
              type="button"
              @click="$emit('delete', profile.id)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- CREATE / EDIT FORM -->
    <template v-else>
      <div class="profile-form">
        <div class="profile-form__header">
          <h3>{{ mode === "edit" ? "Edit Profile" : "New Profile" }}</h3>
          <button class="btn btn--ghost" type="button" @click="cancelForm">
            Cancel
          </button>
        </div>

        <p v-if="notice" class="profile-form__notice">{{ notice }}</p>
        <p v-if="formErrors.form" class="profile-form__error">
          {{ formErrors.form }}
        </p>

        <div class="field-group">
          <label class="field-label" for="profile-id">ID</label>
          <input
            id="profile-id"
            v-model="formId"
            class="field-input"
            type="text"
            :disabled="mode === 'edit'"
            placeholder="my-profile"
            @input="formId = normalizeIdentifier(formId)"
          />
          <p v-if="formErrors.id" class="field-error">{{ formErrors.id }}</p>
        </div>

        <div class="field-group">
          <label class="field-label" for="profile-name">Name</label>
          <input
            id="profile-name"
            v-model="formName"
            class="field-input"
            type="text"
            placeholder="My Profile"
          />
          <p v-if="formErrors.name" class="field-error">
            {{ formErrors.name }}
          </p>
        </div>

        <div class="field-group">
          <label class="field-label" for="profile-desc">Description</label>
          <input
            id="profile-desc"
            v-model="formDescription"
            class="field-input"
            type="text"
            placeholder="Optional description"
          />
        </div>

        <h4 class="profile-form__section-title">MCP & Tool Selection</h4>

        <div
          v-for="entry in formMcps"
          :key="entry.mcpId"
          class="mcp-toggle-card"
        >
          <div class="mcp-toggle-card__header">
            <label class="mcp-toggle-card__label">
              <input v-model="entry.enabled" type="checkbox" />
              <strong>{{ entry.mcpName }}</strong>
              <span class="mcp-toggle-card__id">({{ entry.mcpId }})</span>
            </label>
          </div>

          <div v-if="entry.enabled" class="mcp-toggle-card__tools">
            <label class="tool-toggle">
              <input v-model="entry.allTools" type="checkbox" />
              Expose all tools
            </label>

            <div v-if="!entry.allTools" class="tool-checklist">
              <p
                v-if="!entry.availableTools.length"
                class="tool-checklist__empty"
              >
                No tools available (MCP may not be running).
              </p>
              <label
                v-for="tool in entry.availableTools"
                :key="tool"
                class="tool-checklist__item"
              >
                <input
                  type="checkbox"
                  :checked="entry.selectedTools.has(tool)"
                  @change="toggleTool(entry, tool)"
                />
                {{ tool }}
              </label>
            </div>
          </div>
        </div>

        <div class="profile-form__footer">
          <button
            class="btn btn--primary"
            type="button"
            :disabled="saving"
            @click="submitForm"
          >
            {{ mode === "edit" ? "Update Profile" : "Create Profile" }}
          </button>
        </div>
      </div>
    </template>
  </BaseSection>
</template>

<style scoped>
.profiles-toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.profiles-empty {
  color: var(--color-text-secondary, #888);
  font-style: italic;
  padding: 2rem 0;
}

.profiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.profile-card {
  border: 1px solid var(--color-border, #333);
  border-radius: 8px;
  padding: 1rem;
  background: var(--color-surface, #1a1a1a);
  transition: border-color 0.15s;
}

.profile-card.is-active {
  border-color: var(--color-accent, #6c5ce7);
}

.profile-card__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.profile-card__header h3 {
  margin: 0;
  font-size: 1rem;
}

.profile-badge {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 4px;
}

.profile-badge--active {
  background: var(--color-accent, #6c5ce7);
  color: #fff;
}

.profile-card__description {
  font-size: 0.85rem;
  color: var(--color-text-secondary, #888);
  margin: 0 0 0.5rem;
}

.profile-card__meta {
  font-size: 0.8rem;
  color: var(--color-text-tertiary, #666);
  margin-bottom: 0.75rem;
  display: flex;
  gap: 0.35rem;
}

.profile-card__actions {
  display: flex;
  gap: 0.4rem;
}

/* Form */
.profile-form__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.profile-form__header h3 {
  margin: 0;
}

.profile-form__notice {
  color: var(--color-success, #2ecc71);
  margin-bottom: 1rem;
}

.profile-form__error {
  color: var(--color-error, #e74c3c);
  margin-bottom: 1rem;
}

.profile-form__section-title {
  margin: 1.5rem 0 0.75rem;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary, #888);
}

.profile-form__footer {
  margin-top: 1.5rem;
}

.field-group {
  margin-bottom: 1rem;
}

.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-input {
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--color-border, #333);
  border-radius: 4px;
  background: var(--color-input-bg, #111);
  color: var(--color-text, #eee);
  font-size: 0.9rem;
}

.field-input:disabled {
  opacity: 0.5;
}

.field-error {
  color: var(--color-error, #e74c3c);
  font-size: 0.8rem;
  margin: 0.2rem 0 0;
}

/* MCP toggle cards */
.mcp-toggle-card {
  border: 1px solid var(--color-border, #333);
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: var(--color-surface, #1a1a1a);
}

.mcp-toggle-card__header {
  display: flex;
  align-items: center;
}

.mcp-toggle-card__label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.mcp-toggle-card__id {
  font-size: 0.8rem;
  color: var(--color-text-tertiary, #666);
}

.mcp-toggle-card__tools {
  margin-top: 0.5rem;
  padding-left: 1.5rem;
}

.tool-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.tool-checklist {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
}

.tool-checklist__empty {
  font-size: 0.8rem;
  color: var(--color-text-tertiary, #666);
  font-style: italic;
}

.tool-checklist__item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.82rem;
  cursor: pointer;
  font-family: monospace;
}

/* Shared button styles */
.btn {
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--color-border, #333);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  background: transparent;
  color: var(--color-text, #eee);
  transition:
    background 0.12s,
    border-color 0.12s;
}

.btn:hover {
  background: var(--color-hover, #222);
}

.btn--primary {
  background: var(--color-accent, #6c5ce7);
  border-color: var(--color-accent, #6c5ce7);
  color: #fff;
}

.btn--primary:hover {
  opacity: 0.9;
}

.btn--danger {
  color: var(--color-error, #e74c3c);
  border-color: var(--color-error, #e74c3c);
}

.btn--ghost {
  border-color: transparent;
}

.btn--sm {
  padding: 0.25rem 0.55rem;
  font-size: 0.78rem;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
