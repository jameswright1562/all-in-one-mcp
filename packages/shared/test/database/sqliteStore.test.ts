import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteStore } from "../../src/database/sqliteStore.js";

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    rmSync(target, { recursive: true, force: true });
  }
});

describe("SqliteStore", () => {
  it("persists definitions and reports health", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "shared-store-"));
    cleanupPaths.push(tempDir);

    const store = new SqliteStore(join(tempDir, "runtime.sqlite"));
    store.writeDefinition({
      id: "fixture",
      name: "Fixture",
      enabled: true,
      autoStart: true,
      toolPrefix: "fixture",
      disabledTools: ["dangerous"],
      startupTimeoutMs: 5_000,
      transport: "stdio",
      command: "node",
      args: ["fixture.mjs"],
      env: [],
    });

    expect(store.isHealthy()).toBe(true);
    expect(store.listDefinitions()).toHaveLength(1);
    expect(store.listDefinitions()[0]?.disabledTools).toEqual(["dangerous"]);

    store.close();
  });
});
