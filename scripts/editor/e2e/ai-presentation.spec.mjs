import { test, expect } from "@playwright/test";

const url = "/scripts/editor/e2e/page-layout.html?workspace=ai";
const open = async (page) => {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: /Maya/ })).toBeVisible();
};
const composer = (page) => page.getByRole("textbox", { name: "Ask AI message" });
const send = async (page, text) => {
  await composer(page).fill(text);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
};
const controls = (page, changes) =>
  page.evaluate((changes) => Object.assign(window.pageLayoutFixture.ai, changes), changes);

for (const width of [1400, 390]) {
  test(`chat retains messages and draft across presentations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await send(page, "Keep this conversation");
    await expect(composer(page)).toBeEnabled();
    await expect(page.locator("[data-ai-scroll-shell]")).toContainText("Keep this conversation");
    await composer(page).fill("Unsent follow-up");
    await page.getByRole("button", { name: "Switch to floating chat", exact: true }).click();
    await expect(composer(page)).toHaveValue("Unsent follow-up");
    await page.getByRole("button", { name: "Dock chat in sidebar", exact: true }).click();
    await expect(composer(page)).toHaveValue("Unsent follow-up");
    await page.getByRole("button", { name: "Toggle full page", exact: true }).click();
    await expect(page.locator("[data-ai-scroll-shell]")).toContainText("Keep this conversation");
    await page.reload();
    await expect(page.locator("[data-ai-scroll-shell]")).toContainText("Keep this conversation");
    await page.getByRole("button", { name: "Delete chat", exact: true }).click();
    await expect(page.locator(".is-user")).toHaveCount(0);
  });
}

test("mentions use current editor content, deduplicate databases, show limits and validate citations", async ({
  page,
}) => {
  await open(page);
  await composer(page).fill("@ma");
  await expect(page.getByRole("option", { name: /main page/ })).toBeVisible();
  await composer(page).press("Enter");
  await expect(page.getByRole("button", { name: "Remove main" })).toBeVisible();
  await composer(page).fill("@Task");
  await page.getByRole("option", { name: /Tasks database/ }).click();
  await page.getByRole("button", { name: "Refresh context preview" }).click();
  const draft = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Draft context preview" }) });
  await draft.locator("summary").click();
  await expect(draft).toContainText("Unsynced editor plan");
  await expect(draft).toContainText("1/800 records");
  await controls(page, { localText: "Edited just before sending" });
  await send(page, "Summarize the records");
  await expect(composer(page)).toBeEnabled();
  const sent = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Last sent context" }) });
  await sent.locator("summary").click();
  await expect(sent).toContainText("Edited just before sending");
  const markdown = await sent.locator("pre").textContent();
  expect(markdown.match(/## Data source: Tasks/g)).toHaveLength(1);
  expect(markdown).toContain("Status board");
  await expect(page.getByRole("link", { name: "main", exact: true })).toBeVisible();
  await expect(page.locator('a[href*="invented"]')).toHaveCount(0);
  await page.getByRole("link", { name: "child", exact: true }).click();
  await expect(page.locator("[data-citation-destination]")).toHaveText("child");
});

test("failed submission preserves draft and retries the identical captured request", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Attach current page" }).click();
  await controls(page, { failNext: true });
  await send(page, "Retry this question");
  await expect(page.getByRole("alert")).toContainText("Connection lost");
  await expect(composer(page)).toHaveValue("Retry this question");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(composer(page)).toHaveValue("");
  const requests = await page.evaluate(() => window.pageLayoutFixture.ai.requests);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  await expect(page.locator(".is-user")).toHaveCount(1);
});

test("stop interrupts a stalled stream and preserves the partial answer", async ({ page }) => {
  await open(page);
  await controls(page, { holdStream: true });
  await send(page, "Long answer");
  await expect(page.locator(".is-assistant")).toContainText("Attached records are partial");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(composer(page)).toBeEnabled();
  await expect(page.locator(".is-assistant")).toContainText("stopped");
  await expect.poll(() => page.evaluate(() => window.pageLayoutFixture.ai.cancelled)).toBe(1);
});

for (const phase of ["preparation", "streaming"]) {
  test(`workspace switch discards old ${phase} work`, async ({ page }) => {
    await open(page);
    if (phase === "preparation") {
      await page.getByRole("button", { name: "Attach current page" }).click();
      await controls(page, { holdReads: true });
    } else await controls(page, { holdStream: true });
    await send(page, "Old workspace question");
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    if (phase === "streaming") await expect(page.locator(".is-assistant")).toBeVisible();
    await page.getByRole("button", { name: "Switch workspace", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
    await page.evaluate(() => window.pageLayoutFixture.ai.releaseReads());
    await expect(page.locator(".is-user")).toHaveCount(0);
    await expect(page.locator(".is-assistant")).toHaveCount(0);
    await expect(composer(page)).toBeEnabled();
    await expect(composer(page)).toHaveValue("");
    if (phase === "preparation")
      expect(await page.evaluate(() => window.pageLayoutFixture.ai.requests.length)).toBe(0);
    else
      await expect.poll(() => page.evaluate(() => window.pageLayoutFixture.ai.cancelled)).toBe(1);
  });
}

test("unavailable explicit attachment blocks send and keeps the draft", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Attach current page" }).click();
  await controls(page, { forbidden: true });
  await send(page, "Keep my question");
  await expect(page.getByRole("alert").first()).toContainText("unavailable");
  await expect(composer(page)).toHaveValue("Keep my question");
  expect(await page.evaluate(() => window.pageLayoutFixture.ai.requests.length)).toBe(0);
});
