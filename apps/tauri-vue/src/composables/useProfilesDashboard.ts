import type {
  ProfileCollection,
  ProfileDefinition,
  ProfileEvent,
} from "all-in-one-mcp/contracts";
import { requestJson } from "@/lib/runtimeApi";

export function useProfilesDashboard() {
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
      const response = await requestJson<ProfileCollection>("/api/profiles", {
        method: "GET",
      });
      setProfiles(response);
    } finally {
      loading.value = false;
    }
  }

  async function createProfile(
    profile: ProfileDefinition,
  ): Promise<ProfileDefinition> {
    saving.value = true;
    try {
      const result = await requestJson<ProfileDefinition>("/api/profiles", {
        method: "POST",
        body: JSON.stringify(profile),
      });
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
      const result = await requestJson<ProfileDefinition>(
        `/api/profiles/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(profile),
        },
      );
      await load();
      return result;
    } finally {
      saving.value = false;
    }
  }

  async function deleteProfile(id: string): Promise<void> {
    await requestJson(`/api/profiles/${id}`, {
      method: "DELETE",
    });
    await load();
  }

  async function activateProfile(id: string): Promise<void> {
    await requestJson(`/api/profiles/${id}/activate`, {
      method: "POST",
    });
    activeProfileId.value = id;
  }

  async function deactivateProfile(): Promise<void> {
    await requestJson("/api/profiles/deactivate", {
      method: "POST",
    });
    activeProfileId.value = null;
  }

  function applyEvent(event: ProfileEvent): void {
    if (event.type === "profile-snapshot") {
      const index = profiles.value.findIndex((p) => p.id === event.profile.id);
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
    } else if (event.type === "profile-removed") {
      profiles.value = profiles.value.filter((p) => p.id !== event.profileId);
      if (activeProfileId.value === event.profileId) {
        activeProfileId.value = null;
      }
    } else if (event.type === "profile-activated") {
      activeProfileId.value = event.profileId;
    }
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
