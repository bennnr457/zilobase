import { test, expect } from "@playwright/test";
import { writePrompt } from "./ai-composer-helpers.mjs";
const url = "/scripts/editor/e2e/page-layout.html?workspace=ai&durableAi=1&toolAi=1";

async function start(page, hold = false) {
  await page.goto(url);
  await expect(page.getByRole("textbox", { name: "Ask AI message" })).toBeEnabled();
  await page.evaluate((hold) => {
    window.pageLayoutFixture.ai.holdStream = hold;
  }, hold);
  await writePrompt(page, "Show the project plan");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Debug AI run" })).toBeVisible();
}

test("debugger loads raw payloads on demand, filters, exports and resumes after reload", async ({
  page,
}) => {
  await start(page);
  await expect(page.getByRole("button", { name: "Continue reading", exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.pageLayoutFixture.ai.reads.some((path) => path.includes("/debug")),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Debug AI run" }).click();
  const panel = page.getByRole("dialog", { name: "AI run debugger" });
  await expect(panel.getByRole("status")).toContainText("3 events");
  await panel.locator("summary").filter({ hasText: "tool.call" }).click();
  await expect(panel.locator("pre").filter({ hasText: '"pageId": "main"' })).toBeVisible();
  await panel.locator("summary").filter({ hasText: "tool.result" }).click();
  await expect(panel.locator("pre").filter({ hasText: "Saved server plan" })).toBeVisible();
  await panel.getByRole("textbox", { name: "Filter run events" }).fill("Saved server plan");
  await expect(panel.locator("summary")).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ask-ai-.*\.json$/);
  const output = await download.createReadStream();
  let json = "";
  for await (const chunk of output) json += chunk.toString();
  expect(JSON.parse(json).events).toHaveLength(3);
  const consolePromise = page.waitForEvent("console", (event) =>
    event.text().includes("[Ask AI run]"),
  );
  await panel.getByRole("button", { name: "Log to console" }).click();
  await consolePromise;
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Debug AI run" }).click();
  await expect(
    page.getByRole("dialog", { name: "AI run debugger" }).getByRole("status"),
  ).toContainText("3 events");
});

test("open debugger polls new steps and clears payloads if source access is revoked", async ({
  page,
}) => {
  await start(page, true);
  await page.getByRole("button", { name: "Debug AI run" }).click();
  const panel = page.getByRole("dialog", { name: "AI run debugger" });
  await expect(panel.getByRole("status")).toContainText("1 event");
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.holdStream = false;
  });
  await expect(panel.getByRole("status")).toContainText("3 events");
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.debugDenied = true;
  });
  await panel.getByRole("button", { name: "Refresh run log" }).click();
  await expect(panel.getByRole("alert")).toContainText("Source access denied");
  await expect(panel.locator("summary")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Download JSON" })).toBeDisabled();
});

test("expired logs show an explicit unavailable state", async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.debugExpired = true;
  });
  await page.getByRole("button", { name: "Debug AI run" }).click();
  const panel = page.getByRole("dialog", { name: "AI run debugger" });
  await expect(
    panel.getByText(
      "This run’s raw log has expired or was created before debugging was available.",
    ),
  ).toBeVisible();
  await expect(panel.getByRole("button", { name: "Download JSON" })).toBeDisabled();
});

test("regular streaming answers expose their live raw tool log", async ({ page }) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?workspace=ai");
  await expect(page.getByRole("textbox", { name: "Ask AI message" })).toBeEnabled();
  await writePrompt(page, "Read the saved plan");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: "Debug AI run" }).click();
  const panel = page.getByRole("dialog", { name: "AI run debugger" });
  await expect(panel.getByRole("status")).toContainText("2 events");
  await panel.locator("summary").filter({ hasText: "tool.result" }).click();
  await expect(panel.locator("pre").filter({ hasText: "Saved server plan" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Download JSON" })).toBeEnabled();
  await expect(
    panel.getByText(
      "This live log is available until the conversation is reloaded. Download JSON to keep it.",
    ),
  ).toBeVisible();
});

test("cached inspections and their stop reason are visible", async ({ page }) => {
  await page.goto(url);
  await expect(page.getByRole("textbox", { name: "Ask AI message" })).toBeEnabled();
  await page.evaluate(() => {
    window.pageLayoutFixture.ai.cachedInspection = true;
  });
  await writePrompt(page, "Summarize projects");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Source reused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Debug AI run" }).click();
  await expect(
    page.getByRole("dialog", { name: "AI run debugger" }).getByRole("status"),
  ).toContainText("no_progress");
});
