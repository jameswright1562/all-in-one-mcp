import { describe, expect, it } from "vitest";
import { parseLogMessage, statusRatio, titleCase } from "./formatters";

describe("formatters", () => {
  it("title-cases delimited identifiers", () => {
    expect(titleCase("streamable-http")).toBe("Streamable Http");
  });

  it("extracts structured log prefixes", () => {
    expect(
      parseLogMessage({
        id: 1,
        mcpId: "fixture",
        level: "info",
        source: "manager",
        message: "[runtime.lifecycle] Started",
        timestamp: new Date(0).toISOString(),
      }),
    ).toEqual({
      category: "runtime.lifecycle",
      message: "Started",
    });
  });

  it("maps status values to ratios", () => {
    expect(
      statusRatio({
        definition: {
          id: "fixture",
          name: "Fixture",
          enabled: true,
          autoStart: true,
          toolPrefix: "fixture",
          disabledTools: [],
          startupTimeoutMs: 5_000,
          transport: "stdio",
          command: "node",
          args: [],
          env: [],
        },
        status: "ready",
        tools: [],
        toolCount: 0,
        pid: null,
        updatedAt: new Date(0).toISOString(),
      }),
    ).toBe(1);
  });
});
