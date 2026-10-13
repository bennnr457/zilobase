import assert from "node:assert/strict";
import test from "node:test";
import { canClaimCalendarReminder } from "./reminders.ts";
import { newCalendarEvent } from "./model.ts";
test("reminder claiming rejects stale or pending events and avoids unnecessary pending reads", async () => {
  const event = newCalendarEvent({
    workspaceId: "workspace",
    bindingId: "binding",
    calendarId: "calendar",
    date: "2026-10-12",
    timeZone: "UTC",
  });
  const reminder = { event, key: "reminder", expiresAt: 100 };
  let reads = 0;
  const pending = async () => {
    reads++;
    return 0;
  };
  for (const current of [
    undefined,
    { ...event, status: "cancelled" },
    { ...event, start: { date: "2026-10-13" } },
  ])
    assert.equal(await canClaimCalendarReminder(current, reminder, pending), false);
  assert.equal(reads, 0);
  assert.equal(await canClaimCalendarReminder(event, reminder, pending), true);
  assert.equal(reads, 1);
  assert.equal(await canClaimCalendarReminder(event, reminder, async () => 1), false);
});
