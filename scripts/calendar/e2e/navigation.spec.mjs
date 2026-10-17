import { test, expect } from "@playwright/test";
import { setupCalendar, completeRange, event, card } from "./test-fixture.mjs";
const date = (page) => page.evaluate(() => window.calendarFixture.search().date);
const request = (page, date, view = "week") =>
  page.evaluate(({ date, view }) => window.calendarFixture.request(date, view), { date, view });

test("cached dates open immediately while uncached dates retain the prior period until ready", async ({
  page,
}) => {
  const state = await setupCalendar(page);
  await expect(card(page)).toBeVisible();
  const held = [];
  state.rangeHandler = (route, url) => {
    if (url.searchParams.get("start").startsWith("2030")) {
      held.push(route);
      return;
    }
    return completeRange(route, [event]);
  };
  await request(page, "2030-01-09");
  await expect(
    page.getByRole("status").filter({ hasText: "Loading selected dates" }),
  ).toBeVisible();
  expect(await date(page)).toBe("2026-09-09");
  await expect.poll(() => held.length).toBeGreaterThan(0);
  state.rangeHandler = undefined;
  await Promise.all(held.map((route) => completeRange(route)));
  await expect.poll(() => date(page)).toBe("2030-01-09");
});

test("a newer cached intent cancels an older uncached navigation", async ({ page }) => {
  const state = await setupCalendar(page);
  const held = [];
  state.rangeHandler = (route, url) =>
    url.searchParams.get("start").startsWith("2030")
      ? void held.push(route)
      : completeRange(route, [event]);
  await request(page, "2030-01-09");
  await expect(
    page.getByRole("status").filter({ hasText: "Loading selected dates" }),
  ).toBeVisible();
  await request(page, "2026-09-09");
  await expect(page.getByRole("status").filter({ hasText: "Loading selected dates" })).toHaveCount(
    0,
  );
  state.rangeHandler = undefined;
  await Promise.all(held.map((route) => completeRange(route)));
  expect(await date(page)).toBe("2026-09-09");
});

test("uncached failed navigation offers retry and cached events remain visible", async ({
  page,
}) => {
  const state = await setupCalendar(page);
  state.rangeHandler = (route, url) =>
    url.searchParams.get("start").startsWith("2030")
      ? route.fulfill({ status: 503, json: { message: "Try loading again" } })
      : completeRange(route, [event]);
  await request(page, "2030-01-09");
  await expect(page.getByRole("alert")).toContainText("Try loading again");
  await expect(card(page)).toBeVisible();
  state.rangeHandler = undefined;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => date(page)).toBe("2030-01-09");
});

test("offline navigation permits cached dates and blocks writes and unavailable dates", async ({
  page,
}) => {
  await setupCalendar(page);
  await expect(card(page)).toBeVisible();
  await page.evaluate(() => window.calendarFixture.offline());
  await expect(page.getByRole("button", { name: "Create event", exact: true })).toBeDisabled();
  await request(page, "2026-09-09", "day");
  await expect(page.locator('[data-slot="event-calendar-content"]')).toHaveAttribute(
    "data-view",
    "day",
  );
  await request(page, "2030-01-09", "day");
  await expect(page.getByRole("alert")).toContainText("not cached");
  expect(await date(page)).toBe("2026-09-09");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("Agenda navigation advances thirty days and source loading covers all rendered Month cells", async ({
  page,
}) => {
  const state = await setupCalendar(page);
  await request(page, "2026-09-09", "agenda");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => date(page)).toBe("2026-10-09");
  await request(page, "2026-09-09", "month");
  await expect(page.locator('[data-slot="event-calendar-content"]')).toHaveAttribute(
    "data-view",
    "month",
  );
  const days = await page
    .locator('[data-slot="event-calendar-month-cell"]')
    .evaluateAll((cells) => cells.map((cell) => Number(cell.dataset.ecDay)));
  const requested = state.ranges.map((range) => [Date.parse(range.start), Date.parse(range.end)]);
  expect(
    requested.some(([start, end]) => start <= Math.min(...days) && end > Math.min(...days)),
  ).toBe(true);
  expect(
    requested.some(([start, end]) => start <= Math.max(...days) && end > Math.max(...days)),
  ).toBe(true);
});
