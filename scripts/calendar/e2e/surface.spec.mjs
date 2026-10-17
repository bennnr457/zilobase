import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/calendar/e2e/surface.html");
});
test("shared ReUI calendars run without domain providers and navigate independently", async ({
  page,
}) => {
  const first = page.getByRole("region", { name: "First calendar" }),
    second = page.getByRole("region", { name: "Second calendar" });
  await expect(first.locator("[data-calendar-event-card]").first()).toBeVisible();
  await first.getByRole("button", { name: "Next", exact: true }).click();
  await expect(first.locator("output")).toContainText("2026-09-16T00:00:00.000+05:30");
  await expect(second.locator("output")).toContainText("2026-09-08T18:30");
  await second.getByRole("button", { name: /Plain meeting/ }).click();
  await expect(second.locator("output")).toContainText("selected:meeting");
});
test("read-only cards have no resize grips and cannot commit movement", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" });
  const card = first.getByRole("button", { name: /Read only/ });
  const box = await card.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 10, { steps: 10 });
  await page.mouse.up();
  await expect(first.locator("output")).not.toContainText("changed:readonly");
});
test("density preserves the visible time anchor and weekends change only their own instance", async ({
  page,
}) => {
  const first = page.getByRole("region", { name: "First calendar" }),
    second = page.getByRole("region", { name: "Second calendar" });
  const viewport = first.locator("[data-ec-native-scroll]");
  await viewport.evaluate((el) => (el.scrollTop = 320));
  await first.getByRole("button", { name: "Toggle density" }).click();
  expect(await viewport.evaluate((el) => el.scrollTop)).toBe(640);
  await first.getByRole("button", { name: "Toggle weekends" }).click();
  await expect(first.locator('[data-slot="event-calendar-day-column"]')).toHaveCount(5);
  await expect(second.locator('[data-slot="event-calendar-day-column"]')).toHaveCount(7);
});
