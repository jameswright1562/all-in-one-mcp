import { computed, ref } from "vue";
import { describe, expect, it } from "vitest";
import { useMcpForm } from "./useMcpForm";

describe("useMcpForm", () => {
  it("normalizes ids and builds a stdio definition", () => {
    const mode = ref<"create" | "edit">("create");
    const selectedDefinition = computed(() => null);
    const form = useMcpForm(mode, selectedDefinition);

    form.handleIdInput("My Fixture");
    form.handleNameInput("Fixture");
    form.createForm.command = "node";
    form.createForm.argsText = "server.mjs";

    const definition = form.buildDefinitionFromForm();

    expect(definition).toMatchObject({
      id: "my-fixture",
      name: "Fixture",
      transport: "stdio",
      command: "node",
      args: ["server.mjs"],
    });
  });
});
