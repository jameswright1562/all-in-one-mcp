import type { APIRequestContext, Locator, Page } from "@playwright/test";

export async function resetRuntimeMcps(
  request: APIRequestContext,
): Promise<void> {
  const response = await request.get("http://127.0.0.1:4100/api/mcps");
  if (!response.ok()) {
    return;
  }

  const payload = (await response.json()) as {
    items?: Array<{ definition: { id: string } }>;
  };

  for (const item of payload.items ?? []) {
    await request.delete(
      `http://127.0.0.1:4100/api/mcps/${item.definition.id}`,
    );
  }
}

export function sectionKicker(page: Page, label: string): Locator {
  return page.locator(".section-title > div > p").filter({ hasText: label });
}

export function logsHeading(page: Page): Locator {
  return page.locator(".page-hero h2").filter({ hasText: "LIVE LOGS" });
}

export function consoleBody(page: Page): Locator {
  return page.locator(".console-card__body");
}

export function lifecycleMessage(page: Page, text: string | RegExp): Locator {
  return consoleBody(page).getByText(text);
}

export function configForm(page: Page): Locator {
  return page.locator(".config-card--form");
}

export function fleetCard(page: Page, name: string): Locator {
  return page.locator(".fleet-card").filter({ hasText: name });
}
