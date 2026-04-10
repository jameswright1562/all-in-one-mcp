import { describe, expect, it } from "vitest";
import { managedMcpDefinitionSchema, SECRET_MASK } from "../src/index.js";

describe("managedMcpDefinitionSchema", () => {
  it("parses stdio definitions", () => {
    const parsed = managedMcpDefinitionSchema.parse({
      id: "webclaw",
      name: "WebClaw",
      enabled: true,
      autoStart: true,
      toolPrefix: "webclaw",
      startupTimeoutMs: 10000,
      transport: "stdio",
      command: "npx",
      args: ["-y", "webclaw"],
      env: [{ key: "PORT", value: SECRET_MASK, masked: true }],
    });

    expect(parsed.transport).toBe("stdio");
    expect(parsed.args).toEqual(["-y", "webclaw"]);
  });

  it("parses streamable http definitions", () => {
    const parsed = managedMcpDefinitionSchema.parse({
      id: "remote",
      name: "Remote",
      enabled: true,
      autoStart: false,
      toolPrefix: "remote",
      startupTimeoutMs: 5000,
      transport: "streamable-http",
      url: "http://127.0.0.1:4010/mcp",
      headers: [{ key: "Authorization", value: SECRET_MASK, masked: true }],
    });

    expect(parsed.transport).toBe("streamable-http");
    expect(parsed.url).toContain("/mcp");
  });
});
