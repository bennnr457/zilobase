import assert from "node:assert/strict";
import test from "node:test";
import { getKanbanGroupProperty, type DatabasePropertyListItem } from "./grouping";
import { getConvertedViewConfig } from "./type-transition";
import { getTimelineDateProperty } from "./timeline-date";
import { getCalendarDateProperty } from "./calendar";

const field = (id: string, type: string): DatabasePropertyListItem => ({
  id: `${id}-column`,
  position: 0,
  property: { id, name: id, type },
});

test("Kanban prefers Status, then categorical alternatives, without choosing arbitrary text or dates", () => {
  const status = field("status", "status"),
    select = field("priority", "select");
  const date = field("due", "date"),
    text = field("notes", "text");
  assert.equal(getKanbanGroupProperty([date, text, select, status], {}), status);
  assert.equal(getKanbanGroupProperty([date, text, select], {}), select);
  assert.equal(getKanbanGroupProperty([date, text], {}), null);
  assert.equal(getKanbanGroupProperty([status, select], { groupPropertyId: "priority" }), select);
  assert.equal(getKanbanGroupProperty([status], { groupPropertyId: "deleted" }), status);
  assert.equal(getKanbanGroupProperty([text, status], { groupPropertyId: "notes" }), text);
});

test("Kanban conversion resolves a valid group even when the previous view has none", () => {
  const status = field("status", "status");
  const config = getConvertedViewConfig({
    currentConfig: { datePropertyId: "date", sorts: [] },
    previousType: "timeline",
    type: "kanban",
    kanbanGroupProperty: null,
    properties: [status],
  });
  assert.deepEqual(config, {
    datePropertyId: "date",
    sorts: [],
    groupPropertyId: "status",
    hiddenPropertyIds: ["status-column"],
  });
});

test("date views reject incompatible configured fields and reuse compatible dates", () => {
  const status = field("status", "status"),
    first = field("first", "date"),
    second = field("second", "date");
  for (const resolve of [getTimelineDateProperty, getCalendarDateProperty]) {
    assert.equal(resolve([status, first, second], { datePropertyId: "status" }), first);
    assert.equal(resolve([status, first, second], { datePropertyId: "second" }), second);
    assert.equal(resolve([first], { datePropertyId: "deleted" }), first);
    assert.equal(resolve([status], {}), null);
  }
});
