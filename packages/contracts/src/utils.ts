import { SECRET_MASK } from "./constants.js";
import { type KeyValuePair } from "@all-in-one-mcp/contracts";

export function isoNow(): string {
  return new Date().toISOString();
}

export function taggedMessage(tag: string, message: string): string {
  return `[${tag}] ${
    message
  }`;
}

export function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function maskEntries(entries: KeyValuePair[]): KeyValuePair[] {
  return entries.map((entry) => ({
    key: entry.key,
    value: SECRET_MASK,
    masked: true,
  }));
}

export function unmaskEntries(
  nextEntries: KeyValuePair[],
  previousEntries: KeyValuePair[] | undefined,
): KeyValuePair[] {
  const previousMap = new Map(
    (previousEntries ?? []).map((entry) => [entry.key, entry.value]),
  );

  return nextEntries.map((entry) => ({
    key: entry.key,
    value: previousMap.has(entry.key)
      ? previousMap.get(entry.key)!
      : entry.value,
    masked: false,
  }));
}
