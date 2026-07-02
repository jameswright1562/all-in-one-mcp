import { describe, expect, it, vi } from "vitest";
import { SupabaseStore } from "../../src/database/supabaseStore.js";

describe("SupabaseStore", () => {
  it("should be instantiable", () => {
    // Mock the Supabase client
    vi.mock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({
        from: () => ({
          select: () => ({ order: () => ({ eq: () => ({ single: () => ({}) }) }) }),
          insert: () => ({ select: () => ({ single: () => ({}) }) }),
          upsert: () => ({}),
          delete: () => ({ eq: () => ({}) }),
        }),
      })),
    }));

    const store = new SupabaseStore("https://test.supabase.co", "test-key");
    expect(store).toBeInstanceOf(SupabaseStore);
  });
});