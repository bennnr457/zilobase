import { test, expect } from "@playwright/test";
test("10000 loaded events keep month, overflow and Agenda DOM bounded", async ({
  page,
}, testInfo) => {
  await page.goto("/scripts/calendar/e2e/benchmark.html?count=10000");
  await expect(page.locator("[data-calendar-event-card]").first()).toBeVisible();
  expect(await page.locator("[data-calendar-event-card]").count()).toBeLessThan(100);
  await page.getByRole("button", { name: /more/ }).first().click();
  const list = page.locator("[data-calendar-virtual-list]");
  await expect(list).toBeVisible();
  expect(await list.locator("[data-calendar-event-card]").count()).toBeLessThan(40);
  await list.locator('[data-slot="event-calendar-event"]').first().focus();
  for (let i = 0; i < 45; i++) await page.keyboard.press("Tab");
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  const start = Date.now();
  await page.evaluate(() => window.surfaceFixture.navigate("agenda"));
  await expect(
    page.locator('[data-slot="event-calendar-agenda-view"] [data-calendar-virtual-list]'),
  ).toBeVisible();
  expect(await page.locator("[data-calendar-event-card]").count()).toBeLessThan(60);
  await testInfo.attach("reui-benchmark.json", {
    body: JSON.stringify({ events: 10000, agendaMs: Date.now() - start }),
    contentType: "application/json",
  });
});
test("clock ticks and unrelated updates leave mounted event content unchanged", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/scripts/calendar/e2e/benchmark.html?count=1000");
  await page.waitForFunction(() => Boolean(window.surfaceFixture));
  await page.evaluate(() => window.surfaceFixture.navigate("week"));
  await expect(page.locator('[data-slot="event-calendar-time-grid"]')).toBeVisible();
  await page.evaluate(() => window.surfaceFixture.reset());
  await page.clock.fastForward(60000);
  expect(await page.evaluate(() => window.surfaceFixture.metrics.cards)).toBe(0);
  await page.evaluate(() => window.surfaceFixture.refresh());
  await expect(page.locator("output")).toContainText("week 1");
  expect(await page.evaluate(() => window.surfaceFixture.metrics.cards)).toBe(0);
});
