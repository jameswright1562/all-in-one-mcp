import { reactive, ref, type Ref } from "vue";
import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  managedMcpDefinitionSchema,
  type ManagedMcpDefinition,
} from "@all-in-one-mcp/contracts";
import type { ConfigMode, FormState } from "../types/dashboard";

function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

export function useMcpForm(
  configMode: Ref<ConfigMode>,
  selectedDefinition: Ref<ManagedMcpDefinition | null>,
) {
  const createErrors = ref<Record<string, string>>({});
  const createNotice = ref("");

  function blankForm(): FormState {
    return {
      id: "",
      name: "",
      toolPrefix: "",
      transport: "stdio",
      command: "",
      argsText: "",
      cwd: "",
      envText: "",
      url: "",
      headersText: "",
      enabled: true,
      autoStart: true,
      startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    };
  }

  const createForm = reactive<FormState>(blankForm());

  function resetCreateForm(): void {
    Object.assign(createForm, blankForm());
    createNotice.value = "";
    createErrors.value = {};
  }

  function fillFormFromDefinition(definition: ManagedMcpDefinition): void {
    Object.assign(createForm, {
      id: definition.id,
      name: definition.name,
      toolPrefix: definition.toolPrefix,
      transport: definition.transport,
      command: definition.transport === "stdio" ? definition.command : "",
      argsText:
        definition.transport === "stdio" ? definition.args.join("\n") : "",
      cwd: definition.transport === "stdio" ? (definition.cwd ?? "") : "",
      envText:
        definition.transport === "stdio"
          ? definition.env.map((e) => `${e.key}=${e.value}`).join("\n")
          : "",
      url: definition.transport === "streamable-http" ? definition.url : "",
      headersText:
        definition.transport === "streamable-http"
          ? definition.headers.map((h) => `${h.key}=${h.value}`).join("\n")
          : "",
      enabled: definition.enabled,
      autoStart: definition.autoStart,
      startupTimeoutMs: definition.startupTimeoutMs,
    });
    createErrors.value = {};
  }

  function resetConfigForm(): void {
    createNotice.value = "";
    createErrors.value = {};

    if (configMode.value === "edit" && selectedDefinition.value) {
      fillFormFromDefinition(selectedDefinition.value);
      return;
    }

    resetCreateForm();
  }

  function clearCreateError(field: string): void {
    if (!createErrors.value[field] && !createErrors.value.form) {
      return;
    }

    const nextErrors = { ...createErrors.value };
    delete nextErrors[field];
    delete nextErrors.form;
    createErrors.value = nextErrors;
  }

  function syncIdentifiers(field: "id" | "name", value: string): void {
    createNotice.value = "";
    clearCreateError(field);

    if (field === "id") {
      createForm.id = normalizeIdentifier(value);
      if (!createForm.toolPrefix) {
        createForm.toolPrefix = createForm.id;
      }
      return;
    }

    createForm.name = value;
  }

  function handleIdInput(value: string): void {
    syncIdentifiers("id", value);
  }

  function handleNameInput(value: string): void {
    syncIdentifiers("name", value);
  }

  function setTransport(transport: ManagedMcpDefinition["transport"]): void {
    createNotice.value = "";
    createForm.transport = transport;
    clearCreateError("transport");

    if (transport === "stdio") {
      clearCreateError("url");
      return;
    }

    clearCreateError("command");
  }

  function buildDefinitionFromForm(): ManagedMcpDefinition | null {
    const parseKeyValueText = (text: string) =>
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && line.includes("="))
        .map((line) => {
          const splitIndex = line.indexOf("=");
          return {
            key: line.slice(0, splitIndex).trim(),
            value: line.slice(splitIndex + 1).trim(),
          };
        })
        .filter((entry) => entry.key);

    const candidate: ManagedMcpDefinition =
      createForm.transport === "stdio"
        ? {
            id:
              configMode.value === "edit"
                ? (selectedDefinition.value?.id ?? createForm.id.trim())
                : createForm.id.trim(),
            name: createForm.name.trim(),
            enabled: createForm.enabled,
            autoStart: createForm.autoStart,
            toolPrefix: createForm.toolPrefix.trim(),
            disabledTools: [],
            startupTimeoutMs: Number(createForm.startupTimeoutMs),
            transport: "stdio",
            command: createForm.command.trim(),
            args: createForm.argsText
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean),
            cwd: createForm.cwd.trim() || undefined,
            env: parseKeyValueText(createForm.envText),
          }
        : {
            id: createForm.id.trim(),
            name: createForm.name.trim(),
            enabled: createForm.enabled,
            autoStart: createForm.autoStart,
            toolPrefix: createForm.toolPrefix.trim(),
            disabledTools: [],
            startupTimeoutMs: Number(createForm.startupTimeoutMs),
            transport: "streamable-http",
            url: createForm.url.trim(),
            headers: parseKeyValueText(createForm.headersText),
          };

    const parsed = managedMcpDefinitionSchema.safeParse(candidate);
    if (parsed.success) {
      createErrors.value = {};
      return parsed.data;
    }

    const nextErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      if (!nextErrors[field]) {
        nextErrors[field] = issue.message;
      }
    }

    createErrors.value = nextErrors;
    return null;
  }

  return {
    createForm,
    createErrors,
    createNotice,
    resetCreateForm,
    resetConfigForm,
    fillFormFromDefinition,
    clearCreateError,
    handleIdInput,
    handleNameInput,
    setTransport,
    buildDefinitionFromForm,
  };
}
