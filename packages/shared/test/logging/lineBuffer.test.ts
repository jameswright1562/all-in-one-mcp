import { describe, expect, it, vi } from "vitest";
import { LineBuffer } from "../../src/logging/lineBuffer.js";

describe("LineBuffer", () => {
  it("emits complete lines and flushes the remainder", () => {
    const onLine = vi.fn();
    const buffer = new LineBuffer(onLine);

    buffer.push("first\nsecond");
    buffer.push("\nthird");
    buffer.flush();

    expect(onLine.mock.calls).toEqual([["first"], ["second"], ["third"]]);
  });
});
