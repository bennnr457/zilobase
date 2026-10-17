import { expect } from "@playwright/test";
export const event = {
  workspaceId: "workspace",
  bindingId: "binding",
  calendarId: "primary",
  eventId: "event",
  etag: "v1",
  title: "Design review",
  description: "Discuss calendar design",
  location: "Studio",
  start: { dateTime: "2026-09-09T04:30:00Z", timeZone: "Asia/Kolkata" },
  end: { dateTime: "2026-09-09T05:30:00Z", timeZone: "Asia/Kolkata" },
  status: "confirmed",
  eventType: "default",
  attendees: [],
  reminders: { useDefault: true },
  transparency: "opaque",
  visibility: "default",
  colorId: "2",
  htmlLink: "",
};
export const calendar = {
  id: "primary",
  bindingId: "binding",
  name: "Personal",
  timeZone: "Asia/Kolkata",
  colorId: "2",
  primary: true,
  permissions: { read: true, write: true, owner: true, freeBusyOnly: false },
  defaultReminders: [],
};
export async function setupCalendar(page, options = {}) {
  const state = {
    events: options.events ?? [event],
    calendars: options.calendars ?? [calendar],
    writes: [],
    ranges: [],
    preferences: {},
    ...options,
  };
  await page.route("**/workspaces/workspace/calendar/**", async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method();
    if (url.pathname.endsWith("/preferences")) {
      if (method === "PUT") state.preferences = route.request().postDataJSON();
      return route.fulfill({ json: state.preferences });
    }
    if (url.pathname.endsWith("/realtime-ticket"))
      return route.fulfill({ status: 503, json: { message: "Push unavailable" } });
    if (method === "POST" && url.pathname.includes("/events")) {
      const body = route.request().postDataJSON();
      state.writes.push({ path: url.pathname, ...body });
      if (state.writeHandler) return state.writeHandler(route, body);
      const create = url.pathname.endsWith("/events"),
        remove = url.pathname.endsWith("/delete");
      const updated = {
        ...event,
        ...body.event,
        eventId: create ? `created-${state.writes.length}` : "event",
        etag: "v2",
      };
      state.events = remove
        ? []
        : [...state.events.filter((e) => e.eventId !== updated.eventId), updated];
      return route.fulfill({
        json: {
          operationId: body.operationId,
          status: "succeeded",
          event: remove ? undefined : updated,
        },
      });
    }
    if (["/sync", "/catalog", "/calendars"].some((suffix) => url.pathname.endsWith(suffix)))
      return route.fulfill({
        json: { calendars: state.calendars, revisions: { primary: 1 }, pending: false },
      });
    if (url.pathname.endsWith("/ranges")) {
      state.ranges.push(Object.fromEntries(url.searchParams));
      if (state.rangeHandler) return state.rangeHandler(route, url);
      return completeRange(route, state.events);
    }
    if (url.pathname.endsWith("/sources"))
      return route.fulfill({
        json: {
          providerConfigured: true,
          connections: [
            {
              workspaceId: "workspace",
              bindingId: "binding",
              accountId: "account",
              email: "calendar@example.test",
              status: "connected",
              pushAvailable: false,
            },
          ],
        },
      });
    if (url.pathname.endsWith("/search"))
      return route.fulfill({ json: { events: state.events, nextPageToken: null } });
    return route.fulfill({ json: {} });
  });
  await page.goto(`/scripts/calendar/e2e/index.html${options.query ?? ""}`);
  await page.waitForFunction(() => Boolean(window.calendarFixture));
  await expect(
    page.getByRole("button", { name: "Create event", exact: true }).first(),
  ).toBeEnabled();
  return state;
}
export function completeRange(route, events = []) {
  const url = new URL(route.request().url());
  return route.fulfill({
    json: {
      calendarId: url.searchParams.get("calendarId"),
      start: url.searchParams.get("start"),
      end: url.searchParams.get("end"),
      generation: 1,
      revision: 1,
      events,
      complete: true,
      nextPageToken: null,
    },
  });
}
export async function mode(page, name) {
  await page.locator('[data-slot="event-calendar-view-switcher"]').click();
  const item = page.getByRole("menuitem", { name, exact: true });
  await item.click();
  await expect(item).not.toBeVisible();
  await expect(page.locator('[data-slot="event-calendar-content"]')).toHaveAttribute(
    "data-view",
    name.toLowerCase(),
  );
}
export function cell(page, date) {
  return page.locator(
    `[data-slot="event-calendar-month-cell"][data-ec-day="${Date.parse(`${date}T00:00:00+05:30`)}"]`,
  );
}
export async function draw(page, from, to) {
  const a = await from.boundingBox(),
    b = await to.boundingBox();
  await page.mouse.move(a.x + a.width * 0.45, a.y + a.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.7, { steps: 12 });
  await page.mouse.up();
}
export function card(page, title = "Design review") {
  return page.locator('[data-slot="event-calendar-event"]').filter({ hasText: title }).first();
}
