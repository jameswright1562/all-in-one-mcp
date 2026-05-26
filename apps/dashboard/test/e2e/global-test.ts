import { test as base, expect } from "@playwright/test";
import { resetRuntimeMcps } from "./helpers";

export const test = base;
export { expect };

test.afterEach(async ({ request }) => {
  await resetRuntimeMcps(request);
});
