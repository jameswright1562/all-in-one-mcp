<script setup lang="ts">
import { onMounted, ref } from "vue";
import { waitForRuntimeReady } from "../lib/desktop";

const emit = defineEmits<{
  (event: "ready"): void;
  (event: "failed", message: string): void;
}>();

const message = ref("Starting local MCP runtime…");
const detail = ref("Waiting for /readyz on the embedded runtime host.");

onMounted(async () => {
  try {
    const config = await waitForRuntimeReady(45_000);
    message.value = "Runtime is ready.";
    detail.value = config.baseUrl;
    emit("ready");
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    message.value = "Runtime failed to start.";
    detail.value = text;
    emit("failed", text);
  }
});
</script>

<template>
  <section class="runtime-splash">
    <div class="runtime-splash__card">
      <p class="runtime-splash__eyebrow">All-in-One MCP</p>
      <h1>{{ message }}</h1>
      <p>{{ detail }}</p>
      <div class="runtime-splash__pulse" aria-hidden="true" />
    </div>
  </section>
</template>

<style scoped>
.runtime-splash {
  display: grid;
  min-height: 100vh;
  place-items: center;
  background: radial-gradient(circle at top, #1e293b, #020617 65%);
  color: #f8fafc;
  padding: 24px;
}

.runtime-splash__card {
  width: min(480px, 100%);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 16px;
  padding: 28px;
  background: rgba(15, 23, 42, 0.82);
  box-shadow: 0 24px 60px rgba(2, 6, 23, 0.45);
}

.runtime-splash__eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94a3b8;
}

.runtime-splash h1 {
  margin: 0 0 12px;
  font-size: 24px;
}

.runtime-splash p {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.5;
}

.runtime-splash__pulse {
  width: 48px;
  height: 4px;
  margin-top: 24px;
  border-radius: 999px;
  background: linear-gradient(90deg, #38bdf8, #818cf8, #38bdf8);
  background-size: 200% 100%;
  animation: runtime-splash-pulse 1.4s ease-in-out infinite;
}

@keyframes runtime-splash-pulse {
  0% {
    background-position: 100% 0;
  }

  100% {
    background-position: -100% 0;
  }
}
</style>
