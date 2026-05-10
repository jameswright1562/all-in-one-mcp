import { onMounted, ref } from "vue";
import type {
  ProfileCollection,
  ProfileDefinition,
  ProfileEvent,
} from "@all-in-one-mcp/contracts";
import type { DashboardClient } from "./useDashboardClient";

export function useProfilesDashboard(client: DashboardClient) {
  const profiles = ref<ProfileDefinition[]>([]);
  const activeProfileId = ref<string | null>(null);
  const loading = ref(false);
  const saving = ref(false);

  function setProfiles(collection: ProfileCollection): void {
    profiles.value = [...collection.items].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    activeProfileId.value = collection.activeProfileId;
  }

  async function load(): Promise<void> {
    loading.value = true;
    try {
      setProfiles(await client.fetchProfiles());
    } finally {
      loading.value = false;
    }
  }

  async function createProfile(
    profile: ProfileDefinition,
  ): Promise<ProfileDefinition> {
    saving.value = true;
    try {
      const result = await client.createProfile(profile);
      await load();
      return result;
    } finally {
      saving.value = false;
    }
  }

  async function updateProfile(
    id: string,
    profile: ProfileDefinition,
  ): Promise<ProfileDefinition> {
    saving.value = true;
    try {
      const result = await client.updateProfile(id, profile);
      await load();
      return result;
    } finally {
      saving.value = false;
    }
  }

  async function deleteProfile(id: string): Promise<void> {
    await client.deleteProfile(id);
    await load();
  }

  async function activateProfile(id: string): Promise<void> {
    await client.activateProfile(id);
    activeProfileId.value = id;
  }

  async function deactivateProfile(): Promise<void> {
    await client.deactivateProfile();
    activeProfileId.value = null;
  }

  function applyEvent(event: ProfileEvent): void {
    if (event.type === "profile-snapshot") {
      const index = profiles.value.findIndex(
        (profile) => profile.id === event.profile.id,
      );
      if (index >= 0) {
        profiles.value = [
          ...profiles.value.slice(0, index),
          event.profile,
          ...profiles.value.slice(index + 1),
        ];
      } else {
        profiles.value = [...profiles.value, event.profile].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      }
      return;
    }

    if (event.type === "profile-removed") {
      profiles.value = profiles.value.filter(
        (profile) => profile.id !== event.profileId,
      );
      if (activeProfileId.value === event.profileId) {
        activeProfileId.value = null;
      }
      return;
    }

    activeProfileId.value = event.profileId;
  }

  onMounted(async () => {
    await load();
  });

  return {
    profiles,
    activeProfileId,
    loading,
    saving,
    load,
    createProfile,
    updateProfile,
    deleteProfile,
    activateProfile,
    deactivateProfile,
    applyEvent,
    setProfiles,
  };
}
