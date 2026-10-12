import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarRequestRanges } from "./coverage.ts";
import { newCalendarEvent } from "./model.ts";
import { eventEditorCapability } from "./capabilities.ts";

test("calendar API chunks cover the range exactly with bounded UTC request durations", () => {
  const start = "2026-01-01T00:00:00.000Z";
  const end = "2026-03-03T00:00:00.000Z";
  for (const [chunkDays, expectedLength] of [
    [undefined, 3],
    [100, 2],
    [0, 61],
    [7, 9],
  ]) {
    const ranges = calendarRequestRanges(start, end, chunkDays);
    assert.equal(ranges.length, expectedLength);
    assert.equal(ranges[0].start, start);
    assert.equal(ranges.at(-1).end, end);
    ranges.forEach((range, index) => {
      assert.ok(Date.parse(range.end) > Date.parse(range.start));
      assert.ok(Date.parse(range.end) - Date.parse(range.start) <= 60 * 86400_000);
      if (index) assert.equal(range.start, ranges[index - 1].end);
    });
  }
  assert.deepEqual(calendarRequestRanges(start, start), []);
  assert.deepEqual(calendarRequestRanges(end, start), []);
});

const input = {
  workspaceId: "w",
  bindingId: "binding",
  calendarId: "calendar",
  date: "2026-10-12",
  timeZone: "Asia/Kolkata",
};

test("new events retain local identity, zoned start time and the thirty minute default duration", () => {
  const event = newCalendarEvent({ ...input, hour: 9.5 });
  assert.equal(event.start.dateTime, "2026-10-12T04:00:00Z");
  assert.equal(event.end.dateTime, "2026-10-12T04:30:00.000Z");
  assert.equal(event.start.timeZone, input.timeZone);
  assert.equal(event.calendarId, input.calendarId);
  assert.equal(event.title, "New event");
  assert.match(event.eventId, /^local-/);
  assert.notEqual(event.eventId, newCalendarEvent(input).eventId);
  assert.equal(newCalendarEvent(input).start.dateTime, "2026-10-11T18:30:00Z");
  assert.deepEqual(event.reminders, { useDefault: true });
});

test("event write capability matches both calendar and binding and applies series permissions", () => {
  const event = { ...newCalendarEvent(input), organizer: { self: false } };
  const permissions = { read: true, write: true, owner: true, freeBusyOnly: false };
  const calendars = [
    { id: input.calendarId, bindingId: "other", permissions: { ...permissions, write: false } },
    { id: input.calendarId, bindingId: input.bindingId, permissions },
  ];
  assert.equal(
    eventEditorCapability(true, "following", calendars, event, input.calendarId).allowed,
    true,
  );
  assert.equal(
    eventEditorCapability(false, "occurrence", calendars, event, input.calendarId).allowed,
    true,
  );
  assert.equal(
    eventEditorCapability(false, "following", calendars, event, input.calendarId).allowed,
    false,
  );
  assert.equal(
    eventEditorCapability(false, "occurrence", calendars.slice(0, 1), event, input.calendarId)
      .allowed,
    false,
  );
  assert.equal(
    eventEditorCapability(false, "occurrence", calendars, event, "missing").allowed,
    false,
  );
});
