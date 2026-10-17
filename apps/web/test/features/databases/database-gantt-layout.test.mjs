export function register({ assert, loadModule, test }) {
  test("ReUI model keeps records, empty tracks and structural rows in the same order", async () => {
    const { buildTimelineGanttModel, getTimelineResourceHeight } = await loadModule(
      "/src/sections/databases/views/timeline/lib/reui-model.ts",
    );
    const section = { id: "group", name: "Open", rows: [], groupValue: "Open" };
    const rows = [
      { kind: "group-header", section },
      { kind: "item", item: { id: "a" } },
      { kind: "item", item: { id: "b" } },
      { kind: "new-page", section },
    ];
    const startAt = new Date(2026, 9, 15);
    const endAt = new Date(2026, 9, 18);
    const model = buildTimelineGanttModel(
      rows,
      new Map([
        [
          "a",
          { id: "a", name: "Scheduled", status: { color: "gray" }, feature: { startAt, endAt } },
        ],
        ["b", { id: "b", name: "Unscheduled", status: { color: "gray" }, feature: null }],
      ]),
      true,
    );
    assert.equal(model.resources.length, rows.length);
    assert.deepEqual([...model.rowsByResourceId.values()], rows);
    assert.deepEqual(
      model.resources.slice(1, 3).map((r) => r.id),
      ["a", "b"],
    );
    assert.deepEqual(rows.map(getTimelineResourceHeight), [2.5, 2, 2, 2]);
    assert.equal(model.events.length, 1);
    assert.equal(model.events[0].resourceId, "a");
    assert.equal(model.events[0].start, startAt);
    assert.equal(model.events[0].end, endAt);
    assert.equal(model.events[0].allDay, true);
    assert.equal(model.events[0].readOnly, false);
    assert.equal(
      buildTimelineGanttModel(
        rows,
        new Map([
          ["a", { id: "a", name: "A", status: { color: "gray" }, feature: { startAt, endAt } }],
        ]),
        false,
      ).events[0].readOnly,
      true,
    );
  });
}
