<script setup lang="ts">
import { computed, ref } from "vue";
import type { SkillCatalogEntry } from "../types/dashboard";
import catalog from "../skills-catalog.json";

defineEmits<{
  install: [entry: SkillCatalogEntry];
}>();

const searchQuery = ref("");
const activeTags = ref<string[]>([]);

const allTags = computed(() => {
  const tagSet = new Set<string>();
  for (const entry of catalog) {
    for (const tag of entry.tags) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort();
});

const filteredCatalog = computed(() => {
  let results = catalog as SkillCatalogEntry[];

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.trim().toLowerCase();
    results = results.filter(
      (entry) =>
        entry.name.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query) ||
        entry.tags.some((tag) => tag.includes(query)),
    );
  }

  if (activeTags.value.length > 0) {
    results = results.filter((entry) =>
      activeTags.value.some((tag) => entry.tags.includes(tag)),
    );
  }

  return results;
});

function toggleTag(tag: string): void {
  const index = activeTags.value.indexOf(tag);
  if (index === -1) {
    activeTags.value.push(tag);
  } else {
    activeTags.value.splice(index, 1);
  }
}

function isTagActive(tag: string): boolean {
  return activeTags.value.includes(tag);
}
</script>

<template>
  <section class="page-panel">
    <div class="section-title">
      <div>
        <p>SKILLS</p>
        <h2>Browse Installable MCPs</h2>
      </div>
      <span>{{ filteredCatalog.length }} available</span>
    </div>

    <div class="skills-toolbar">
      <input
        v-model="searchQuery"
        type="text"
        class="skills-search"
        placeholder="Search skills by name, description, or tag..."
      />
      <div class="skills-tags">
        <button
          v-for="tag in allTags"
          :key="tag"
          type="button"
          class="skill-tag"
          :class="{ 'is-active': isTagActive(tag) }"
          @click="toggleTag(tag)"
        >
          {{ tag }}
        </button>
      </div>
    </div>

    <div v-if="filteredCatalog.length === 0" class="empty-console">
      <h3>No skills found</h3>
      <p>Try adjusting your search or tag filters.</p>
    </div>

    <div v-else class="fleet-grid">
      <article
        v-for="entry in filteredCatalog"
        :key="entry.id"
        class="fleet-card skill-card"
      >
        <div class="fleet-card__body">
          <div class="fleet-card__header">
            <div>
              <p>{{ entry.transport }}</p>
              <h3>{{ entry.name }}</h3>
            </div>
          </div>

          <p class="skill-card__description">{{ entry.description }}</p>

          <dl class="fleet-card__stats">
            <div>
              <dt>ID</dt>
              <dd>{{ entry.id }}</dd>
            </div>
            <div>
              <dt>Command</dt>
              <dd>{{ entry.command ?? entry.url ?? "—" }}</dd>
            </div>
          </dl>

          <div class="skill-card__tags">
            <span v-for="tag in entry.tags" :key="tag" class="skill-tag">
              {{ tag }}
            </span>
          </div>
        </div>

        <div class="fleet-card__actions">
          <button
            class="action-chip action-chip--primary"
            type="button"
            @click="$emit('install', entry)"
          >
            Install
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
