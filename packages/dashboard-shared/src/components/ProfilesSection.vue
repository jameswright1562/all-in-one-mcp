<script setup lang="ts">
import { ref } from "vue";
import type {
  ProfileDefinition,
  ProfileMcpEntry,
  ManagedMcpSnapshot,
} from "@all-in-one-mcp/contracts";

const props = defineProps<{
  profiles: ProfileDefinition[];
  activeProfileId: string | null;
  items: ManagedMcpSnapshot[];
  saving: boolean;
  createProfile: (profile: ProfileDefinition) => Promise<ProfileDefinition>;
  updateProfile: (
    id: string,
    profile: ProfileDefinition,
  ) => Promise<ProfileDefinition>;
  deleteProfile: (id: string) => Promise<void>;
}>();

defineEmits<{
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
    .filter((entry: McpFormEntry) => entry.enabled)
    .map((entry: McpFormEntry) => ({
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
      await props.updateProfile(editingId.value, profile);
      notice.value = `Profile "${profile.name}" updated.`;
    } else {
      await props.createProfile(profile);
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

async function confirmDeleteProfile(profile: ProfileDefinition): Promise<void> {
  const confirmed = window.confirm(
    `Delete profile "${profile.name}"? This cannot be undone.`,
  );
  if (!confirmed) {
    return;
  }

  try {
    await props.deleteProfile(profile.id);
    notice.value = `Profile "${profile.name}" deleted.`;
  } catch (error) {
    formErrors.value = {
      form:
        error instanceof Error ? error.message : "Failed to delete profile.",
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
  <section class="page-panel max-w-[1180px]">
    <div class="section-title">
      <div>
        <p>PROFILES</p>
        <h2>Manage tool exposure profiles</h2>
      </div>
      <span>Choose which MCPs and tools are visible to clients.</span>
    </div>

    <!-- LIST VIEW -->
    <template v-if="mode === 'list'">
      <div class="flex flex-wrap gap-3">
        <button class="action-button" type="button" @click="startCreate">
          + New Profile
        </button>

        <button
          v-if="activeProfileId"
          class="action-button--soft"
          type="button"
          @click="$emit('deactivate')"
        >
          Deactivate Profile
        </button>
      </div>

      <section v-if="!profiles.length" class="empty-console px-6 py-5">
        <h3>No profiles created yet</h3>
        <p class="mt-2 text-[var(--muted)]">
          Create one to control which MCPs and tools are exposed.
        </p>
      </section>

      <div
        v-else
        class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5"
      >
        <div
          v-for="profile in profiles"
          :key="profile.id"
          class="grid gap-3 rounded-[var(--radius-lg)] border border-[rgba(106,87,74,0.08)] bg-[rgba(245,241,234,0.92)] p-5 shadow-[var(--shadow)] transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-[rgba(23,19,17,0.94)]"
          :class="{
            'border-[rgba(212,91,58,0.38)] shadow-[0_26px_50px_rgba(212,91,58,0.12)] bg-blue':
              activeProfileId === profile.id,
          }"
        >
          <div class="flex items-center justify-between gap-3">
            <h3
              class="m-0 font-['Manrope','Inter',sans-serif] text-xl font-extrabold tracking-[-0.03em]"
            >
              {{ profile.name }}
            </h3>
            <span
              v-if="activeProfileId === profile.id"
              class="shrink-0 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--primary-strong)] px-2.5 py-1 text-[0.68rem] font-extrabold tracking-[0.08em] text-[#fff8f1]"
            >
              ACTIVE
            </span>
          </div>

          <p
            v-if="profile.description"
            class="m-0 leading-relaxed text-[#5a5048] dark:text-[#c3b5aa]"
          >
            {{ profile.description }}
          </p>

          <div
            class="flex items-center gap-1.5 text-[0.84rem] font-bold uppercase tracking-[0.08em] text-[#877a71] dark:text-[#b6a79c]"
          >
            <span>{{ profile.mcps.filter((m) => m.enabled).length }} MCPs</span>
            <span>·</span>
            <span>
              {{ profile.mcps.reduce(toolCountDisplay, 0) }}
              tools
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="activeProfileId !== profile.id"
              class="action-chip bg-[rgba(212,91,58,0.14)] text-[var(--primary-strong)]"
              type="button"
              @click="$emit('activate', profile.id)"
            >
              Activate
            </button>
            <button
              class="action-chip"
              type="button"
              @click="startEdit(profile)"
            >
              Edit
            </button>
            <button
              class="action-chip action-chip--danger"
              type="button"
              @click="confirmDeleteProfile(profile)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- CREATE / EDIT FORM -->
    <template v-else>
      <section class="config-card grid gap-5 p-6">
        <div class="flex items-center justify-between gap-4">
          <h3
            class="m-0 font-['Manrope','Inter',sans-serif] text-xl font-extrabold tracking-[-0.03em]"
          >
            {{ mode === "edit" ? "Edit Profile" : "New Profile" }}
          </h3>
          <button class="action-chip" type="button" @click="cancelForm">
            Cancel
          </button>
        </div>

        <p v-if="notice" class="form-banner form-banner--success">
          {{ notice }}
        </p>
        <p v-if="formErrors.form" class="form-banner form-banner--error">
          {{ formErrors.form }}
        </p>

        <label class="field" for="profile-id">
          <span>ID</span>
          <input
            id="profile-id"
            v-model="formId"
            type="text"
            :disabled="mode === 'edit'"
            placeholder="my-profile"
            @input="formId = normalizeIdentifier(formId)"
          />
          <em v-if="formErrors.id">{{ formErrors.id }}</em>
        </label>

        <label class="field" for="profile-name">
          <span>Name</span>
          <input
            id="profile-name"
            v-model="formName"
            type="text"
            placeholder="My Profile"
          />
          <em v-if="formErrors.name">
            {{ formErrors.name }}
          </em>
        </label>

        <label class="field" for="profile-desc">
          <span>Description</span>
          <input
            id="profile-desc"
            v-model="formDescription"
            type="text"
            placeholder="Optional description"
          />
        </label>

        <h4
          class="m-0 mt-2 text-[0.88rem] font-extrabold uppercase tracking-[0.16em] text-[var(--primary)]"
        >
          MCP & Tool Selection
        </h4>

        <div
          v-for="entry in formMcps"
          :key="entry.mcpId"
          class="grid gap-3 rounded-[20px] border border-[rgba(106,87,74,0.1)] bg-[rgba(255,253,249,0.78)] p-4 dark:border-white/10 dark:bg-white/5"
        >
          <div class="flex items-center">
            <label class="flex cursor-pointer items-center gap-2">
              <input
                v-model="entry.enabled"
                class="size-4 accent-[var(--primary)]"
                type="checkbox"
              />
              <strong
                class="font-['Manrope','Inter',sans-serif] text-[var(--ink)] dark:text-[#f2e7e0]"
              >
                {{ entry.mcpName }}
              </strong>
              <span class="text-sm text-[var(--muted)] dark:text-[#c3b5aa]"
                >({{ entry.mcpId }})</span
              >
            </label>
          </div>

          <div
            v-if="entry.enabled"
            class="grid gap-3 border-t border-[rgba(106,87,74,0.1)] pt-3 pl-7 dark:border-white/10"
          >
            <label
              class="flex cursor-pointer items-center gap-2 font-bold text-[#5c4f48] dark:text-[#f2e7e0]"
            >
              <input
                v-model="entry.allTools"
                class="size-4 accent-[var(--primary)]"
                type="checkbox"
              />
              Expose all tools
            </label>

            <div v-if="!entry.allTools" class="flex flex-wrap gap-x-4 gap-y-2">
              <p
                v-if="!entry.availableTools.length"
                class="m-0 italic text-[var(--muted)] dark:text-[#c3b5aa]"
              >
                No tools available (MCP may not be running).
              </p>
              <label
                v-for="tool in entry.availableTools"
                :key="tool"
                class="flex cursor-pointer items-center gap-1.5 font-mono text-sm text-[#3d3530] dark:text-[#f2e7e0]"
              >
                <input
                  type="checkbox"
                  class="size-4 accent-[var(--primary)]"
                  :checked="entry.selectedTools.has(tool)"
                  @change="toggleTool(entry, tool)"
                />
                {{ tool }}
              </label>
            </div>
          </div>
        </div>

        <div class="mcp-form__actions mt-2">
          <button
            class="action-button"
            type="button"
            :disabled="saving"
            @click="submitForm"
          >
            {{ mode === "edit" ? "Update Profile" : "Create Profile" }}
          </button>
        </div>
      </section>
    </template>
  </section>
</template>
