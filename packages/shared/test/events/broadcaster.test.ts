import { describe, expect, it, vi } from "vitest";
import { EventBroadcaster } from "../../src/events/broadcaster.js";

describe("EventBroadcaster", () => {
  it("notifies active listeners", () => {
    const broadcaster = new EventBroadcaster<{ value: string }>();
    const listener = vi.fn();

    broadcaster.subscribe(listener);
    broadcaster.emit({ value: "ok" });

    expect(listener).toHaveBeenCalledWith({ value: "ok" });
  });

  it("stops notifying unsubscribed listeners", () => {
    const broadcaster = new EventBroadcaster<number>();
    const listener = vi.fn();

    const unsubscribe = broadcaster.subscribe(listener);
    unsubscribe();
    broadcaster.emit(1);

    expect(listener).not.toHaveBeenCalled();
  });
});
