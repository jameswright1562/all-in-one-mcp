<script setup lang="ts">
import type { VNodeChild } from "vue";

defineProps<{
  title: string;
  header?: string;
}>();
</script>

<template>
  <section class="d-grid g-1">
    <div class="d-flex items-center justify-between gap-1">
      <p>{{ title }}</p>
      <h2 v-if="header">{{ header }}</h2>
    </div>
    <slot />
  </section>
</template>
