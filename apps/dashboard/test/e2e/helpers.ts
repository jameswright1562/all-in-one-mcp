import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const fixturePath = resolve(
  fileURLToPath(
    new URL(
      "../../../../packages/runtime/test/fixtures/stdio-tool-server.mjs",
      import.meta.url,
    ),
  ),
);

export async function ensureRuntimeReady(
  request: APIRequestContext,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await request.get("http://127.0.0.1:4100/readyz");
        return response.ok() ? response.status() : 0;
      },
      {
        message: "Expected the managed MCP runtime to be ready",
        timeout: 15_000,
      },
    )
    .toBe(200);
}

export async function resetRuntime(request: APIRequestContext): Promise<void> {
  await ensureRuntimeReady(request);

  const response = await request.get("http://127.0.0.1:4100/api/mcps");
  const collection = (await response.json()) as {
    items: Array<{ definition: { id: string } }>;
  };

  for (const item of collection.items) {
    await request.delete(
      `http://127.0.0.1:4100/api/mcps/${item.definition.id}`,
    );
  }
}

export async function gotoConfig(page: Page): Promise<void> {
  await page.goto("/");
  const serviceSwitch = page.locator(".service-switch select");
  if (await serviceSwitch.isEnabled()) {
    await serviceSwitch.selectOption("");
  }
  await page
    .locator(".portal-nav__item")
    .filter({ hasText: "Config" })
    .first()
    .click({ force: true });
}

export async function navigate(page: Page, label: string): Promise<void> {
  await page
    .locator(".portal-nav__item")
    .filter({ hasText: label })
    .first()
    .click({ force: true });
}
