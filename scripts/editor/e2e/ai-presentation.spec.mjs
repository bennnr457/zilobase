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
    await expect(page.getByRole("combobox", { name: "Conversation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New chat", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete chat", exact: true })).toHaveCount(0);
  });
}

for (const width of [1400, 390]) {
  test(`mention databases remain available beyond the mixed search limit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await controls(page, { extraSearchPages: 60 });
    const before = await composer(page).boundingBox();
    await composer(page).fill("@");
    const database = page.getByRole("option", { name: /Tasks database/i });
    await expect(database).toBeVisible();
    await expect(page.getByRole("group", { name: "Pages", exact: true })).toContainText("A page 0");
    await expect(composer(page)).toBeFocused();
    expect((await composer(page).boundingBox()).height).toBe(before.height);
    const requests = await page.evaluate(() => window.pageLayoutFixture.ai.searchRequests);
    expect(
      requests.some(
        (path) => new URL(path, "http://fixture").searchParams.get("types") === "database",
      ),
    ).toBe(true);
    expect(
      requests.some((path) => new URL(path, "http://fixture").searchParams.get("types") === "page"),
    ).toBe(true);
    await composer(page).press("Enter");
    await expect(page.getByRole("button", { name: "Remove Tasks", exact: true })).toBeVisible();
    await expect(composer(page)).toHaveValue("");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Remove Tasks", exact: true }).click();
    await composer(page).fill("@Task");
    await database.click();
    await expect(page.getByRole("button", { name: "Remove Tasks", exact: true })).toBeVisible();
  });
}

test("mentions use current editor content and validate citations without debug UI", async ({
  page,
}) => {
  await open(page);
  await composer(page).fill("@ma");
  await expect(page.getByRole("option", { name: /main page/i })).toBeVisible();
  await composer(page).press("Enter");
  await expect(page.getByRole("button", { name: "Remove main" })).toBeVisible();
  await composer(page).fill("@Task");
  await page.getByRole("option", { name: /Tasks database/i }).click();
  await expect(page.getByRole("button", { name: "Refresh context preview" })).toHaveCount(0);
  await controls(page, { localText: "Edited just before sending" });
  await send(page, "Summarize the records");
  await expect(composer(page)).toBeEnabled();
  const requests = await page.evaluate(() => window.pageLayoutFixture.ai.requests);
  expect(requests).toHaveLength(1);
  expect(JSON.stringify(requests[0].snapshots)).toContain("Edited just before sending");
  await expect(
    page.locator("summary", { hasText: /Last sent context|Draft context preview/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "main", exact: true })).toBeVisible();
  const answer = page.locator(".is-assistant");
  await expect(answer).not.toContainText("[[");
  await expect(answer.locator("details")).toHaveCount(0);
  await expect(answer.getByRole("link", { name: "main", exact: true })).toContainText("📝");
  await expect(answer.getByRole("link", { name: "child", exact: true })).toContainText("✅");
  await expect(page.locator('a[href*="invented"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".is-assistant")).not.toContainText("[[");
  await expect(page.getByRole("link", { name: "main", exact: true })).toContainText("📝");
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
  await expect(page.getByText("streaming", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Writing answer…", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(composer(page)).toBeEnabled();
  await expect(page.locator(".is-assistant")).toContainText("Attached records are partial");
  await expect(page.getByText("stopped", { exact: true })).toHaveCount(0);
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
    await expect(page.getByText("Preparing context…", { exact: true })).toHaveCount(0);
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
