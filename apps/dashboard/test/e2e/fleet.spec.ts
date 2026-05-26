import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./global-test";
import { fleetCard } from "./helpers";

const fixturePath = resolve(
  fileURLToPath(
    new URL(
      "../../../../packages/runtime/test/fixtures/stdio-tool-server.mjs",
      import.meta.url,
    ),
  ),
);

test.describe("Fleet Management", () => {
  test("shows empty state when no MCPs are configured", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Fleet" }).click();

    await expect(page.getByText("No fleet members")).toBeVisible();
    await expect(
      page.getByText(
        "Once MCP definitions are stored, their runtime cards will appear here.",
      ),
    ).toBeVisible();
  });

  test("displays MCP cards with correct information", async ({
    page,
    request,
  }) => {
    const id = `fleet-test-${Date.now()}`;

    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Fleet Test Server",
        enabled: true,
        autoStart: true,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Fleet" }).click();

    const card = fleetCard(page, "Fleet Test Server");
    await expect(card.getByText("Fleet Test Server")).toBeVisible();
    await expect(card.getByText("stdio", { exact: true })).toBeVisible();
    await expect(card.getByText(id)).toBeVisible();
    await expect(card.getByText(/(Ready|Starting)/i)).toBeVisible();
    await expect(card.getByText("Prefix", { exact: true })).toBeVisible();
    await expect(card.getByText("Tools", { exact: true })).toBeVisible();
    await expect(card.getByText("Updated", { exact: true })).toBeVisible();
  });

  test("start action initiates MCP", async ({ page, request }) => {
    const id = `start-test-${Date.now()}`;

    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Start Test Server",
        enabled: true,
        autoStart: false,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Fleet" }).click();

    const card = fleetCard(page, "Start Test Server");
    await card.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForTimeout(1000);
    await expect(card.getByText(/(Starting|Ready)/i)).toBeVisible();
  });

  test("stop action stops MCP", async ({ page, request }) => {
    const id = `stop-test-${Date.now()}`;

    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Stop Test Server",
        enabled: true,
        autoStart: true,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Fleet" }).click();

    const card = fleetCard(page, "Stop Test Server");
    await expect(card.getByText(/Ready/i)).toBeVisible({ timeout: 10000 });
    await card.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(card.getByText(/Stopped/i)).toBeVisible({ timeout: 5000 });
  });

  test("restart action restarts MCP", async ({ page, request }) => {
    const id = `restart-test-${Date.now()}`;

    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Restart Test Server",
        enabled: true,
        autoStart: true,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Fleet" }).click();

    const card = fleetCard(page, "Restart Test Server");
    await expect(card.getByText(/Ready/i)).toBeVisible({ timeout: 10000 });
    await card.getByRole("button", { name: "Restart", exact: true }).click();
    await expect(card.getByText(/(Stopping|Starting)/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(card.getByText(/Ready/i)).toBeVisible({ timeout: 15000 });
  });

  test("selecting card navigates to logs with MCP selected", async ({
    page,
    request,
  }) => {
    const id = `select-test-${Date.now()}`;

    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Select Test Server",
        enabled: true,
        autoStart: true,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Fleet" }).click();

    const card = fleetCard(page, "Select Test Server");
    await card.locator(".fleet-card__body").click();

    await expect(card).toHaveClass(/is-selected/);
    await expect(page.locator(".service-switch select")).toHaveValue(id);
  });

  test("shows last error when MCP has error state", async ({
    page,
    request,
  }) => {
    const id = `error-test-${Date.now()}`;

    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Error Test Server",
        enabled: true,
        autoStart: true,
        toolPrefix: id,
        startupTimeoutMs: 1000,
        transport: "stdio",
        command: "non-existent-command-12345",
        args: [],
        env: [],
      },
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Fleet" }).click();

    const card = fleetCard(page, "Error Test Server");
    await expect(
      card.locator(".fleet-card__status").filter({ hasText: /^Error$/ }),
    ).toBeVisible({ timeout: 5000 });
  });
});
