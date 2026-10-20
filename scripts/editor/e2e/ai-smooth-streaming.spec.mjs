import { test, expect } from "@playwright/test";

const url = "/scripts/editor/e2e/ai-components.html?activity-message=1";
const payload = "👩🏽‍💻 Cafe\u0301 日本語 smooth streaming. ".repeat(30).trimEnd();
const response = (page) => page.locator('.is-assistant [data-slot="message-content"]');
// Clock-driven rendering tests use DOM clicks so Playwright's pointer stability
// checks don't themselves require an animation frame while the clock is paused.
const click = (page, name) =>
  page.getByRole("button", { name, exact: true }).evaluate((node) => node.click());
async function open(page, motion = "no-preference") {
  await page.emulateMedia({ reducedMotion: motion });
  await page.clock.install();
  await page.goto(url);
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toBeVisible();
  // Resolve the lazy markdown module before freezing timers, so Suspense's own
  // retry timers cannot affect the measured text cadence.
  await page.getByRole("button", { name: "Stream answer", exact: true }).click();
  await expect(response(page).locator("p")).toHaveText("Streamed answer.");
  await page.getByRole("button", { name: "Reset answer", exact: true }).click();
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
}

test("bursts reveal progressively at grapheme boundaries and drain smoothly after completion", async ({
  page,
}) => {
  await open(page);
  await click(page, "Stream burst");
  await expect(page.getByLabel("Received response")).toHaveText(payload);
  const boundaries = new Set([
    0,
    ...Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(payload),
      ({ index, segment }) => index + segment.length,
    ),
  ]);
  const lengths = [];
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(60);
    await expect(page.getByRole("status", { name: "Thinking", exact: true })).toHaveCount(0);
    const visible = await response(page).textContent();
    expect(payload.startsWith(visible)).toBe(true);
    expect(boundaries.has(visible.length)).toBe(true);
    lengths.push(visible.length);
    if (i === 0) {
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(payload.length);
      await click(page, "Finish answer");
      await expect(page.getByRole("button", { name: "Copy response", exact: true })).toHaveCount(0);
    }
  }
  expect(lengths.every((length, index) => index === 0 || length > lengths[index - 1])).toBe(true);
  await page.clock.runFor(40);
  const nearEnd = (await response(page).textContent()).length;
  await page.clock.runFor(60);
  await expect(response(page)).toHaveText(payload);
  // Catch-up must not dump a large exponential tail into the final frame.
  expect(payload.length - nearEnd).toBeLessThan(payload.length / 4);
  await expect(page.getByRole("button", { name: "Copy response", exact: true })).toBeVisible();
  await expect(response(page).locator("[data-sd-animate]")).toHaveCount(0);
});

test("Stop immediately shows all received text and copy retains the complete response", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.smoothCopiedText = text;
        },
      },
    }),
  );
  await click(page, "Stream burst");
  await expect(page.getByLabel("Received response")).toHaveText(payload);
  await page.clock.runFor(60);
  const partial = await response(page).textContent();
  expect(payload.startsWith(partial)).toBe(true);
  expect(partial.length).toBeGreaterThan(0);
  expect(partial.length).toBeLessThan(payload.length);
  await click(page, "Stop answer");
  await expect(response(page)).toHaveText(payload);
  await click(page, "Copy response");
  await expect.poll(() => page.evaluate(() => window.smoothCopiedText)).toBe(payload);
  await page.clock.runFor(400);
  await expect(response(page)).toHaveText(payload);
  await expect(response(page)).not.toHaveAttribute("data-ai-streaming");
});

test("corrected snapshots replace the queued text and never reintroduce stale characters", async ({
  page,
}) => {
  await open(page);
  await click(page, "Stream burst");
  await expect(page.getByLabel("Received response")).toHaveText(payload);
  await page.clock.runFor(60);
  await expect(page.getByRole("status", { name: "Thinking", exact: true })).toHaveCount(0);
  await click(page, "Replace answer");
  await expect(response(page)).toHaveText("Corrected server snapshot.");
  await page.clock.runFor(400);
  await expect(response(page)).toHaveText("Corrected server snapshot.");
});

test("reduced motion bypasses the reveal queue and disables word animations", async ({ page }) => {
  await open(page, "reduce");
  await click(page, "Stream burst");
  await expect(response(page)).toHaveText(payload);
  await expect(response(page).locator("[data-sd-animate]").first()).toBeAttached();
  expect(
    await response(page)
      .locator("[data-sd-animate]")
      .evaluateAll((nodes) =>
        nodes.every((node) => getComputedStyle(node).animationName === "none"),
      ),
  ).toBe(true);
  await click(page, "Finish answer");
  await expect(page.getByRole("button", { name: "Copy response", exact: true })).toBeVisible();
});
