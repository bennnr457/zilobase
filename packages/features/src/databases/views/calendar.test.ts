import { addDays } from "date-fns";
import assert from "node:assert/strict";
import test from "node:test";
import { createDatabaseViewCommands } from "../records/view-commands";
import { applyConfigurationChanges } from "../interactions/configuration";
import {
  calendarClickSchedule,
  calendarScheduleToValue,
  getCalendarDateProperty,
  getDatabaseCalendarMode,
  parseCalendarSchedule,
} from "./calendar";

test("calendar dates round-trip inclusive all-day ranges and timed scalar values", () => {
  for (const value of [
    "2026-10-17",
    ["2026-10-17", "2026-10-20"],
    ["2026-10-17T23:30", "2026-10-18T01:00"],
  ]) {
    const event = parseCalendarSchedule(value)!;
    assert.ok(event);
    assert.deepEqual(calendarScheduleToValue(event), value);
  }
  const timed = parseCalendarSchedule("2026-10-17T09:30")!;
  assert.equal(timed.allDay, false);
  assert.equal(timed.end.getTime() - timed.start.getTime(), 3600000);
  const moved = { ...timed, start: addDays(timed.start, 1), end: addDays(timed.end, 1) };
  assert.equal(calendarScheduleToValue(moved, "2026-10-17T09:30", true), "2026-10-18T09:30");
  assert.deepEqual(calendarScheduleToValue(moved), ["2026-10-18T09:30", "2026-10-18T10:30"]);
  for (const value of [
    "",
    "bad",
    "2026-02-31",
    ["2026-10-17", "bad"],
    ["2026-10-20", "2026-10-17"],
  ])
    assert.equal(parseCalendarSchedule(value), null);
});

test("calendar civil dates survive DST and non-UTC time zones", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["Asia/Kolkata", "America/New_York", "UTC"]) {
      process.env.TZ = zone;
      for (const value of ["2026-03-08", "2026-11-01", ["2026-03-07", "2026-03-09"]])
        assert.deepEqual(calendarScheduleToValue(parseCalendarSchedule(value)!), value);
      const day = calendarClickSchedule(new Date(2026, 2, 8, 15, 30), true);
      assert.equal(calendarScheduleToValue(day), "2026-03-08");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("calendar configuration reuses a compatible date when the configured property is missing", () => {
  const date = {
    id: "column",
    position: 0,
    property: { id: "date", type: "date", name: "Due", config: {} },
  };
  assert.equal(getCalendarDateProperty([date], { datePropertyId: "deleted" }), date);
  assert.equal(getCalendarDateProperty([date], {}), date);
  assert.equal(getDatabaseCalendarMode({ calendarView: "week" }), "week");
  assert.equal(getDatabaseCalendarMode({ calendarView: "unknown" }), "month");
});

test("the first calendar visibility toggle shows only the chosen property and subsequent toggles compose", () => {
  let config: unknown = { datePropertyId: "date" };
  const commands = createDatabaseViewCommands({
    editable: true,
    databaseId: "source",
    activeView: { id: "view", type: "calendar", config },
    properties: [
      { id: "date-column", property: { id: "date", type: "date", config: {} } },
      { id: "status-column", property: { id: "status", type: "status", config: {} } },
    ],
    activeDatabaseFilters: [],
    activeDatabaseSorts: [],
    items: [],
    getLatestViewConfig: () => config,
    mutations: {
      updateDatabaseView: async (input: {
        configuration: Parameters<typeof applyConfigurationChanges>[1];
      }) => {
        config = applyConfigurationChanges(config, input.configuration);
      },
    },
    notify: { error() {}, success() {} },
  } as unknown as Parameters<typeof createDatabaseViewCommands>[0]);
  commands.togglePropertyVisibility("status-column");
  assert.deepEqual(config, { datePropertyId: "date", hiddenPropertyIds: ["date-column"] });
  commands.togglePropertyVisibility("date-column");
  assert.deepEqual(config, { datePropertyId: "date", hiddenPropertyIds: [] });
  commands.togglePropertyVisibility("status-column");
  assert.deepEqual(config, { datePropertyId: "date", hiddenPropertyIds: ["status-column"] });
});

test("calendar commands create blank-title dated records, preserve configuration and reject read-only writes", async () => {
  const calls: unknown[] = [];
  const date = {
    id: "column",
    position: 0,
    property: { id: "date", type: "date", name: "Due", config: {} },
  };
  const make = (editable = true) =>
    createDatabaseViewCommands({
      editable,
      databaseId: "source",
      viewDatabaseId: "host",
      properties: [date],
      activeView: {
        id: "view",
        type: "calendar",
        config: { datePropertyId: "date", groupPropertyId: "status" },
      },
      activeDatabaseFilters: [],
      activeDatabaseSorts: [],
      items: [],
      timelineDateProperty: null,
      kanbanGroupProperty: null,
      mutations: {
        addRow: async (input: unknown) => {
          calls.push(input);
          return { id: "row", pageId: "page" };
        },
        addDatabaseView: async (input: unknown) => calls.push(input),
        addProperty: async () => undefined,
        updateDatabaseView: async (input: unknown) => calls.push(input),
      },
      notify: { error() {}, success() {} },
      onViewCreated() {},
      onSortsChanged() {},
    } as unknown as Parameters<typeof createDatabaseViewCommands>[0]);
  const commands = make();
  assert.deepEqual(
    await commands.addCalendarRow(calendarClickSchedule(new Date(2026, 9, 17), true)),
    { rowId: "row", pageId: "page" },
  );
  assert.deepEqual(calls[0], {
    databaseId: "source",
    hostDatabaseId: "host",
    title: "",
    initialValues: [{ propertyId: "date", value: "2026-10-17" }],
  });
  commands.addCalendarView();
  const { onOptimistic, ...calendarInput } = calls[1] as Record<string, unknown>;
  assert.equal(typeof onOptimistic, "function");
  assert.deepEqual(calendarInput, {
    databaseId: "host",
    dataSourceId: "source",
    name: "Calendar",
    type: "calendar",
    config: { datePropertyId: "date", calendarView: "month" },
  });
  commands.setCalendarMode("week");
  assert.ok(JSON.stringify(calls[2]).includes("calendarView"));
  await assert.rejects(make(false).addCalendarRow(calendarClickSchedule(new Date(), true)));
  assert.equal(calls.length, 3);
});
