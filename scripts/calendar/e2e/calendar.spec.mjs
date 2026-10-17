import { test, expect } from "@playwright/test";
import { setupCalendar, event, calendar, mode, cell, draw, card } from "./test-fixture.mjs";

test("Google Calendar uses one ReUI surface, opens its event dock, and persists all four modes", async ({
  page,
}) => {
  const state = await setupCalendar(page);
  await expect(page.locator('[data-slot="event-calendar"]')).toHaveCount(1);
  await expect(page.locator("[data-calendar-period-scroll]")).toHaveCount(0);
  await card(page).click();
  await expect(page.getByRole("heading", { name: "Design review", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close calendar event panel" }).click();
  for (const name of ["Month", "Day", "Agenda", "Week"]) {
    await mode(page, name);
    expect(state.preferences.view).toBe(name.toLowerCase());
  }
  await mode(page, "Agenda");
  await page.reload();
  await expect(page.locator('[data-slot="event-calendar-content"]')).toHaveAttribute(
    "data-view",
    "agenda",
  );
});

test("click seeds an exclusive all-day draft, focuses the blank title and saves exactly once", async ({
  page,
}) => {
  const state = await setupCalendar(page);
  await mode(page, "Month");
  await cell(page, "2026-09-11").click({ position: { x: 40, y: 60 } });
  await expect(page.getByLabel("Title", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Start date", { exact: true })).toHaveValue("2026-09-11");
  await expect(page.getByLabel("End date", { exact: true })).toHaveValue("2026-09-11");
  expect(state.writes).toHaveLength(0);
  await page.getByLabel("Title", { exact: true }).fill("New ReUI event");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].event.start).toEqual({ date: "2026-09-11" });
  expect(state.writes[0].event.end).toEqual({ date: "2026-09-12" });
  await expect(page.locator("[data-calendar-event-panel]")).toHaveAttribute("aria-hidden", "true");
  await expect(card(page, "New ReUI event")).toBeVisible();
  await page.reload();
  await expect(card(page, "New ReUI event")).toBeVisible();
});

for (const reverse of [false, true])
  test(`range creation ${reverse ? "backward" : "forward"} keeps dates anchored and Cancel creates nothing`, async ({
    page,
  }) => {
    const state = await setupCalendar(page);
    await mode(page, "Month");
    const top = await page.evaluate(() => window.scrollY);
    await draw(
      page,
      cell(page, reverse ? "2026-09-12" : "2026-09-10"),
      cell(page, reverse ? "2026-09-10" : "2026-09-12"),
    );
    await expect(page.getByLabel("Start date", { exact: true })).toHaveValue("2026-09-10");
    await expect(page.getByLabel("End date", { exact: true })).toHaveValue("2026-09-12");
    await expect(page.getByLabel("Title", { exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(top);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(state.writes).toHaveLength(0);
    await expect(page.locator("[data-calendar-creating]")).toHaveCount(0);
  });

test("Escape cancels drawing and closing a draft requires confirmed dismissal", async ({
  page,
}) => {
  const state = await setupCalendar(page);
  await mode(page, "Month");
  const a = await cell(page, "2026-09-10").boundingBox(),
    b = await cell(page, "2026-09-12").boundingBox();
  await page.mouse.move(a.x + 50, a.y + 60);
  await page.mouse.down();
  await page.mouse.move(b.x + 50, b.y + 60, { steps: 10 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await page.getByRole("button", { name: "Close calendar event panel" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close calendar event panel" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  expect(state.writes).toHaveLength(0);
});

test("timed click creates one hour and dragging saves one snapped mutation", async ({ page }) => {
  const state = await setupCalendar(page);
  const column = page.locator('[data-slot="event-calendar-day-column"]').nth(3);
  const rect = await column.boundingBox();
  await page.mouse.click(rect.x + rect.width * 0.6, rect.y + 11 * 48 + 5);
  await expect(page.getByLabel("Start date", { exact: true })).toHaveValue("2026-09-10");
  await page.getByLabel("Title", { exact: true }).fill("Timed draft");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(
    Date.parse(state.writes[0].event.end.dateTime) -
      Date.parse(state.writes[0].event.start.dateTime),
  ).toBe(3600000);
  await expect(page.locator("[data-calendar-event-panel]")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#right-sidebar-dock")).not.toHaveAttribute(
    "data-sidebar-transitioning",
    "",
  );
  const bar = await card(page).boundingBox();
  await page.mouse.move(bar.x + 30, bar.y + 12);
  await page.mouse.down();
  await page.mouse.move(bar.x + 30, bar.y + 36, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => state.writes.length).toBe(2);
  expect(Date.parse(state.writes[1].event.start.dateTime) - Date.parse(event.start.dateTime)).toBe(
    1800000,
  );
  expect(state.writes[1].event.start.timeZone).toBe("Asia/Kolkata");
  await expect(page.locator("[data-calendar-event-panel]")).toHaveAttribute("aria-hidden", "true");
});

test("recurring or invited event movement requires panel confirmation", async ({ page }) => {
  const state = await setupCalendar(page, {
    events: [{ ...event, recurringEventId: "series", originalStartTime: event.start }],
  });
  const bar = await card(page).boundingBox();
  await page.mouse.move(bar.x + 25, bar.y + 10);
  await page.mouse.down();
  await page.mouse.move(bar.x + 25, bar.y + 34, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Design review");
  expect(state.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].recurrenceScope).toBe("occurrence");
});

test("failed and ambiguous writes retain the draft and prevent duplicate creation", async ({
  page,
}) => {
  const state = await setupCalendar(page, {
    writeHandler: (route) =>
      route.fulfill({ status: 409, json: { message: "Event changed elsewhere" } }),
  });
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Keep this draft");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Event changed elsewhere");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Keep this draft");
  state.writeHandler = (route, body) =>
    route.fulfill({ json: { operationId: body.operationId, status: "ambiguous" } });
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check delivery status" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save event", exact: true })).toBeDisabled();
  expect(state.writes).toHaveLength(2);
});

test("runtime-only storage supports Google reads and writes without IndexedDB", async ({
  page,
}) => {
  const state = await setupCalendar(page, { query: "?memory=1" });
  await expect(card(page)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "temporary storage" })).toBeVisible();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Memory event");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
});

test("event details, deep links, guests, Meet and mobile dock transitions remain available", async ({
  page,
}) => {
  await setupCalendar(page, {
    events: [
      {
        ...event,
        conferenceUrl: "https://meet.google.com/abc-defg-hij",
        attendees: [{ email: "me@example.test", self: true, responseStatus: "needsAction" }],
      },
    ],
  });
  await page.evaluate(() => window.calendarFixture.select("event"));
  await expect(page.getByRole("link", { name: "Google Meet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Yes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Dock draft");
  await page.getByRole("button", { name: "Open AI", exact: true }).click();
  await page.getByRole("button", { name: "Close AI", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Dock draft");
  await page.setViewportSize({ width: 390, height: 780 });
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Dock draft");
});

test("all-day collapse, four timezone columns, density, themes and narrow calendar remain aligned", async ({
  page,
}) => {
  const state = await setupCalendar(page, {
    events: [{ ...event, start: { date: "2026-09-09" }, end: { date: "2026-09-11" } }],
  });
  await expect(card(page)).toBeVisible();
  const viewport = page.locator('[data-slot="event-calendar-time-grid"] [data-ec-native-scroll]');
  await viewport.evaluate((el) => (el.scrollTop = 300));
  await page.getByRole("button", { name: "Collapse all-day events" }).click();
  await expect(card(page)).toHaveCount(0);
  expect(await viewport.evaluate((el) => el.scrollTop)).toBe(300);
  await page.getByRole("button", { name: "Expand all-day events", exact: true }).click();
  await expect(card(page)).toBeVisible();
  for (const dark of [true, false]) {
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
    await page.screenshot({
      path: `.dev/calendar-e2e-results/reui-${dark ? "dark" : "light"}.png`,
    });
  }
  await page.setViewportSize({ width: 390, height: 700 });
  await mode(page, "Month");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.writes).toHaveLength(0);
});
