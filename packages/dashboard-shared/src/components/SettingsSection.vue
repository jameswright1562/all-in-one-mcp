<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { SettingsAdapter } from "../composables/useDashboardClient";

const props = defineProps<{
  adapter: SettingsAdapter;
}>();

const enabled = ref(false);
const loading = ref(true);
const error = ref("");

async function loadState(): Promise<void> {
  loading.value = true;
  error.value = "";

  try {
    enabled.value = await props.adapter.isEnabled();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : String(nextError);
    enabled.value = false;
  } finally {
    loading.value = false;
  }
}

async function toggleEnabled(): Promise<void> {
  loading.value = true;
  error.value = "";

  try {
    await props.adapter.setEnabled(enabled.value);
    enabled.value = await props.adapter.isEnabled();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : String(nextError);
    enabled.value = !enabled.value;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadState();
});
</script>

<template>
  <section class="page-panel">
    <div class="page-hero">
      <div>
        <h2>SETTINGS</h2>
      </div>
    </div>

    <div class="settings-card">
      <div class="settings-row">
        <div class="settings-row__info">
          <strong>{{ adapter.title ?? "Launch on startup" }}</strong>
          <p>
            {{
              adapter.description ??
              "Automatically start the desktop app when you log into your system."
            }}
          </p>
          <p v-if="error" class="settings-row__error">{{ error }}</p>
        </div>
        <label class="toggle-switch" :class="{ 'is-loading': loading }">
          <input
            v-model="enabled"
            type="checkbox"
            :disabled="loading"
            @change="toggleEnabled"
          />
          <span class="toggle-slider" />
        </label>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-card {
  background: var(--surface-card, #fff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 24px;
  margin-top: 16px;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-row__info strong {
  display: block;
  font-size: 14px;
  margin-bottom: 4px;
}

.settings-row__info p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary, #64748b);
}

.settings-row__error {
  margin-top: 6px;
  color: #b91c1c;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--border-color, #cbd5e1);
  border-radius: 24px;
  transition: background 0.2s;
}

.toggle-slider::before {
  content: "";
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background: #3b82f6;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.toggle-switch.is-loading {
  opacity: 0.5;
  pointer-events: none;
}
</style>
