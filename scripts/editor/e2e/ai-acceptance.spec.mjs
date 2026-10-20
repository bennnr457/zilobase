import { writePrompt } from "./ai-composer-helpers.mjs";
import { test, expect } from "@playwright/test";

const url = "/scripts/editor/e2e/page-layout.html?workspace=ai";
const composer = (page) => page.getByRole("textbox", { name: "Ask AI message" });

test("full-width preference expands both history and composer within the existing page frame", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(url);
  await expect(composer(page)).toBeEnabled();
  await page.getByRole("button", { name: "Toggle full page", exact: true }).click();
  await expect(page.locator('[data-chat-layout="page"]')).toHaveCount(2);
  const before = await page.locator('[data-chat-layout="page"]').last().boundingBox();
  expect(before.width).toBe(900);
  await page.evaluate(() => {
    const { queryClient, settings } = window.pageLayoutFixture;
    queryClient.setQueryData(["user-settings"], { ...settings(), pageFullWidth: true });
  });
  await expect(page.locator('[data-chat-layout="full"]')).toHaveCount(2);
  const history = await page.locator('[data-chat-layout="full"]').first().boundingBox();
  const footer = await page.locator('[data-chat-layout="full"]').last().boundingBox();
  expect(history.width).toBe(1100);
  expect(footer.width).toBe(history.width);
  expect(footer.x).toBe(history.x);
  const input = await composer(page).boundingBox();
  expect(input.x).toBeGreaterThanOrEqual(footer.x);
  expect(input.x + input.width).toBeLessThanOrEqual(footer.x + footer.width);
});

test("narrow panels retain their width while the mention popup opens", async ({ page }) => {
  await page.goto(url);
  await expect(composer(page)).toBeEnabled();
  await page.locator("[data-ai-workspace-shell]").evaluate((node) => {
    node.closest('[style*="max-width"]').style.maxWidth = "320px";
  });
  const input = composer(page);
  const before = await input.boundingBox();
  expect(before.width).toBeLessThan(320);
  await writePrompt(page, "@");
  await expect(page.getByRole("option", { name: /Tasks database/i })).toBeVisible();
  expect(await input.boundingBox()).toEqual(before);
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Remove Tasks", exact: true })).toBeVisible();
  expect((await input.boundingBox()).width).toBe(before.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const motion of ["no-preference", "reduce"]) {
  test(`${motion}: streaming follows the live edge and preserves the reader's position after scrolling away`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto(url);
    const input = composer(page);
    await expect(input).toBeEnabled();
    await page.evaluate(() => {
      window.pageLayoutFixture.ai.holdStream = true;
    });
    await writePrompt(page, "Keep streaming");
    await input.press("Enter");
    await expect(page.locator(".is-assistant")).toBeVisible();
    const append = (text) =>
      page.evaluate((text) => window.pageLayoutFixture.ai.appendAnswer(text), text);
    await append(
      "\n\n" +
        "A long streamed paragraph with readable history.\n\n".repeat(80) +
        "End of initial output.",
    );
    await expect(page.locator(".is-assistant")).toContainText("End of initial output.");
    const history = page.locator("[data-ai-scroll-shell]");
    await expect
      .poll(() =>
        history.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight),
      )
      .toBeLessThan(2);
    const liveTop = await history.evaluate((node) => node.scrollTop);
    expect(liveTop).toBeGreaterThan(500);
    await history.hover();
    await page.mouse.wheel(0, -1500);
    await expect(page.getByRole("button", { name: "Scroll to bottom", exact: true })).toBeVisible();
    await expect.poll(() => history.evaluate((node) => node.scrollTop)).toBeLessThan(liveTop - 200);
    const readingTop = await history.evaluate((node) => node.scrollTop);
    await append("\n\n" + "More streamed output.\n\n".repeat(30) + "End of later output.");
    await expect(page.locator(".is-assistant")).toContainText("End of later output.");
    await expect
      .poll(() => history.evaluate((node, top) => Math.abs(node.scrollTop - top), readingTop))
      .toBeLessThan(2);
    await page.getByRole("button", { name: "Scroll to bottom", exact: true }).click();
    await expect
      .poll(() =>
        history.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight),
      )
      .toBeLessThan(2);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(input).toBeEnabled();
    await expect(page.getByRole("log")).toHaveCount(1);
  });
}
