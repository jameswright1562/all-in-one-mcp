import { test as base, expect } from "@playwright/test";
import { resetRuntimeMcps } from "./helpers";

export const test = base;
export { expect };

test.beforeEach(async ({ request }) => {
  await resetRuntimeMcps(request);
});

test.afterEach(async ({ request }) => {
  await resetRuntimeMcps(request);
});
