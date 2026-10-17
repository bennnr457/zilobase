export function register({ assert, loadModule, readSource, test }) {
  const base = {
    workspaceId: "workspace",
    bindingId: "binding",
    calendarId: "primary",
    eventId: "event",
    etag: "v1",
    title: "Review",
    description: "",
    location: "",
    start: { date: "2026-10-31" },
    end: { date: "2026-11-02" },
    status: "confirmed",
    eventType: "default",
    attendees: [],
    reminders: { useDefault: true },
    transparency: "opaque",
    visibility: "default",
    colorId: null,
    htmlLink: "",
  };
  test("both owners use one provider-independent ReUI calendar composition", async () => {
    const renderer = await readSource(
      "/src/sections/calendar/primitives/components/calendar-renderer.tsx",
    );
    assert.match(renderer, /EventCalendar<TData>/);
    assert.doesNotMatch(renderer, /useCalendarWorkspace|useDatabase.*Context|apiFetch/);
    for (const owner of [
      "/src/sections/calendar/views/components/calendar-schedule.tsx",
      "/src/sections/databases/views/calendar/components/database-calendar-view.tsx",
    ])
      assert.match(await readSource(owner), /CalendarRenderer/);
  });
  for (const timeZone of ["Asia/Kolkata", "America/New_York", "Pacific/Auckland"])
    test(`Google all-day exclusive ends round-trip in ${timeZone} across DST`, async () => {
      const { googleCalendarEvent, googleEventTiming } = await loadModule(
        "/src/sections/calendar/views/lib/reui-events.ts",
      );
      const { defaultCalendarPreferences } = await loadModule(
        "/packages/features/src/calendar/model.ts",
      );
      const calendar = { permissions: { read: true, write: true, freeBusyOnly: false } };
      const item = googleCalendarEvent(base, calendar, defaultCalendarPreferences(timeZone), true);
      assert.equal(item.allDay, true);
      assert.deepEqual(googleEventTiming(item, timeZone, base), {
        start: base.start,
        end: base.end,
      });
      assert.equal(item.data, base);
      assert.equal(item.recurrence, undefined);
      assert.notEqual(
        item.id,
        googleCalendarEvent(
          { ...base, bindingId: "another" },
          calendar,
          defaultCalendarPreferences(timeZone),
          true,
        ).id,
      );
    });
  test("timed movement preserves source timezone and instant; provider recurrence is not expanded twice", async () => {
    const { googleCalendarEvent, googleEventProposal } = await loadModule(
      "/src/sections/calendar/views/lib/reui-events.ts",
    );
    const { defaultCalendarPreferences } = await loadModule(
      "/packages/features/src/calendar/model.ts",
    );
    const event = {
      ...base,
      start: { dateTime: "2026-11-01T01:30:00-04:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-11-01T01:30:00-05:00", timeZone: "America/New_York" },
      recurringEventId: "series",
      recurrence: ["RRULE:FREQ=DAILY"],
    };
    const item = googleCalendarEvent(
      event,
      { permissions: { read: true, write: true } },
      defaultCalendarPreferences("Asia/Kolkata"),
      true,
    );
    assert.equal(item.end.getTime() - item.start.getTime(), 3600000);
    assert.equal(item.recurrence, undefined);
    const proposed = googleEventProposal(
      {
        event: item,
        start: new Date(item.start.getTime() + 1800000),
        end: new Date(item.end.getTime() + 1800000),
        allDay: false,
      },
      "Asia/Kolkata",
    );
    assert.equal(proposed.start.timeZone, "America/New_York");
    assert.equal(proposed.recurringEventId, "series");
    assert.equal(Date.parse(proposed.start.dateTime) - Date.parse(event.start.dateTime), 1800000);
  });
  test("read-only, pending and specialized events cannot be manipulated, with color overrides retained", async () => {
    const { googleCalendarEvent } = await loadModule(
      "/src/sections/calendar/views/lib/reui-events.ts",
    );
    const { defaultCalendarPreferences } = await loadModule(
      "/packages/features/src/calendar/model.ts",
    );
    const prefs = defaultCalendarPreferences("UTC");
    prefs.calendarColors[JSON.stringify(["binding", "primary"])] = "red";
    const writable = { permissions: { read: true, write: true }, colorId: "2" };
    const normal = googleCalendarEvent(base, writable, prefs, true);
    assert.equal(normal.readOnly, false);
    assert.match(normal.color, /red/);
    assert.equal(googleCalendarEvent(base, writable, prefs, false).readOnly, true);
    assert.equal(googleCalendarEvent(base, writable, prefs, true, true).readOnly, true);
    assert.equal(
      googleCalendarEvent({ ...base, eventType: "focusTime" }, writable, prefs, true).readOnly,
      true,
    );
    assert.equal(
      googleCalendarEvent(base, { permissions: { read: true, write: false } }, prefs, true)
        .readOnly,
      true,
    );
  });
  test("click defaults use one civil day or one hour and drag ranges remain unmodified", async () => {
    const { googleSlotRange, googleEventTiming } = await loadModule(
      "/src/sections/calendar/views/lib/reui-events.ts",
    );
    const date = new Date("2026-03-08T05:00:00Z");
    const range = googleSlotRange({ date, allDay: true, view: "month" }, "America/New_York");
    assert.equal(range.end - range.start, 23 * 3600000);
    assert.deepEqual(googleEventTiming(range, "America/New_York"), {
      start: { date: "2026-03-08" },
      end: { date: "2026-03-09" },
    });
    assert.equal(
      googleSlotRange({ date, allDay: false, view: "week" }, "America/New_York").end - date,
      3600000,
    );
    const drawn = {
      start: date,
      end: new Date("2026-03-11T04:00:00Z"),
      allDay: true,
      view: "month",
    };
    assert.deepEqual(googleSlotRange(drawn, "America/New_York"), {
      start: drawn.start,
      end: drawn.end,
      allDay: true,
    });
  });
}
