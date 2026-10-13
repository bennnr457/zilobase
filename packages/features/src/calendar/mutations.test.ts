import assert from "node:assert/strict";
import test from "node:test";
import { calendarMutationSettlement, createPendingCalendarMutation } from "./mutations";
import { calendarEventKey, newCalendarEvent } from "./model";

test("calendar optimistic writes preserve rollback snapshots and unresolved status", () => {
  const event = newCalendarEvent({
    workspaceId: "workspace",
    bindingId: "binding",
    calendarId: "calendar",
    date: "2026-10-12",
    timeZone: "UTC",
  });
  const cached = { ...event, title: "Cached" };
  const write = {
    operationId: "operation",
    event: { title: "Optimistic" },
    sendUpdates: "none" as const,
  };
  for (const action of ["create", "duplicate", "update", "move", "rsvp", "delete"] as const) {
    const pending = createPendingCalendarMutation(action, event, write, cached);
    assert.equal(pending.eventKey, calendarEventKey(event));
    assert.equal(
      pending.before,
      action === "create" || action === "duplicate" ? undefined : cached,
    );
    assert.equal(pending.optimistic?.title, action === "delete" ? undefined : "Optimistic");
    assert.equal(pending.status, "pending");
    assert.deepEqual(
      calendarMutationSettlement(pending, { operationId: "operation", status: "failed" }),
      { event: pending.before },
    );
    assert.deepEqual(
      calendarMutationSettlement(pending, { operationId: "operation", status: "succeeded", event }),
      { event },
    );
    for (const status of ["pending", "ambiguous"] as const) {
      assert.equal(calendarMutationSettlement(pending, { operationId: "operation", status }), null);
    }
  }
  assert.equal(createPendingCalendarMutation("update", event, write, undefined).before, event);
});
