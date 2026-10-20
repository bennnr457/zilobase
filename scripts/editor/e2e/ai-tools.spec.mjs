import { test, expect } from "@playwright/test";
import { writePrompt, draft } from "./ai-composer-helpers.mjs";

const url = "/scripts/editor/e2e/page-layout.html?workspace=ai&durableAi=1&toolAi=1";
const composer = (page) => page.getByRole("textbox", { name: "Ask AI message" });

test("mentions submit references, tool activity streams, and continuation keeps the same sources", async ({
  page,
}) => {
  await page.goto(url);
  await expect(composer(page)).toBeEnabled();
  await page.getByRole("button", { name: "Attach current page", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove main", exact: true })).toBeVisible();
  const reads = await page.evaluate(() => window.pageLayoutFixture.ai.reads);
  expect(reads.some((path) => path.startsWith("/pages/") || path.includes("/export"))).toBe(false);
  await writePrompt(page, "Read these projects");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue reading", exact: true })).toBeVisible();
  await expect(page.locator(".is-assistant")).toContainText("Records read");
  const first = await page.evaluate(() => window.pageLayoutFixture.ai.requests[0]);
  expect(first.roots).toEqual([{ type: "page", id: "main" }]);
  expect(first.snapshots).toEqual([]);
  expect(first.history).toEqual([]);
  expect(first.continueFromRunId).toBeUndefined();
  expect(JSON.stringify(first)).not.toContain("Unsynced editor plan");
  await page.reload();
  const resume = page.getByRole("button", { name: "Continue reading", exact: true });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(composer(page)).toBeEnabled();
  await expect(page.locator(".is-user")).toHaveCount(2);
  await expect(page.locator(".is-assistant")).toHaveCount(2);
  await expect(resume).toHaveCount(0);
  const continued = await page.evaluate(() => window.pageLayoutFixture.ai.requests.at(-1));
  expect(continued.continueFromRunId).toMatch(/^[0-9a-f-]{36}$/);
  expect(continued.roots).toEqual(first.roots);
  await expect(draft(page)).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("normal form submission does not serialize its React form event as a continuation", async ({
  page,
}) => {
  await page.goto(url);
  await expect(composer(page)).toBeEnabled();
  await writePrompt(page, "Hello");
  await composer(page).press("Enter");
  await expect(composer(page)).toBeEnabled();
  await expect(page.locator(".is-assistant")).toContainText("Partial answer");
  const requests = await page.evaluate(() => window.pageLayoutFixture.ai.requests);
  expect(requests).toHaveLength(1);
  expect(requests[0].continueFromRunId).toBeUndefined();
});
