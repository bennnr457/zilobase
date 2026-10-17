import { test, expect } from "@playwright/test";
test("ReUI now indicator follows the selected timezone without changing event instants", async ({
  page,
}) => {
  await page.goto("/scripts/calendar/e2e/surface.html");
  // Load TZDate against native Date before installing the clock's replacement constructor.
  await page.getByRole("region", { name: "First calendar" }).waitFor();
  await page.clock.install({ time: new Date("2026-09-10T07:03:00Z") });
  await page.evaluate(() => window.calendarSurface.remount());
  const first = page.getByRole("region", { name: "First calendar" });
  const indicator = first.locator('[data-slot="event-calendar-now-indicator"]');
  await expect(indicator).toBeAttached();
  await expect(first.locator('[data-slot="event-calendar-day-header"][data-today]')).toContainText(
    "Thu 10",
  );
  const top = await indicator.evaluate((el) => parseFloat(getComputedStyle(el).top));
  await page.clock.fastForward(60000);
  expect(
    (await indicator.evaluate((el) => parseFloat(getComputedStyle(el).top))) - top,
  ).toBeCloseTo(0.8, 0);
  await first.getByRole("button", { name: "Toggle timezone" }).click();
  await expect
    .poll(() => indicator.evaluate((el) => parseFloat(getComputedStyle(el).top)))
    .toBeLessThan(top - 200);
});
test("civil midnight updates today's header without repainting event data", async ({ page }) => {
  await page.goto("/scripts/calendar/e2e/surface.html");
  await page.getByRole("region", { name: "First calendar" }).waitFor();
  await page.clock.install({ time: new Date("2026-09-09T18:29:30Z") });
  await page.evaluate(() => window.calendarSurface.remount());
  const first = page.getByRole("region", { name: "First calendar" });
  await expect(first.locator('[data-slot="event-calendar-day-header"][data-today]')).toContainText(
    "Wed 9",
  );
  await page.clock.fastForward(31000);
  await expect(first.locator('[data-slot="event-calendar-day-header"][data-today]')).toContainText(
    "Thu 10",
  );
});
