export function register({ assert, loadModule, test }) {
  test("grouped timeline targets include each group's final boundary and empty creation row", async () => {
    const { getTimelineGroupDropTarget } = await loadModule(
      "/src/sections/databases/views/timeline/lib/database-timeline-layout.ts",
    );
    const groups = [
      {
        sectionId: "open",
        top: 0,
        bottom: 168,
        footerTop: 136,
        rows: [
          { top: 72, bottom: 104 },
          { top: 104, bottom: 136 },
        ],
      },
      { sectionId: "empty", top: 188, bottom: 292, footerTop: 260, rows: [] },
      {
        sectionId: "done",
        top: 312,
        bottom: 448,
        footerTop: 416,
        rows: [{ top: 384, bottom: 416 }],
      },
    ];
    assert.deepEqual(getTimelineGroupDropTarget(groups, 150), {
      sectionId: "open",
      localTargetIndex: 2,
      top: 136,
    });
    assert.deepEqual(getTimelineGroupDropTarget(groups, 270), {
      sectionId: "empty",
      localTargetIndex: 0,
      top: 260,
    });
    assert.deepEqual(getTimelineGroupDropTarget(groups, 390), {
      sectionId: "done",
      localTargetIndex: 0,
      top: 384,
    });
    assert.deepEqual(getTimelineGroupDropTarget(groups, 410), {
      sectionId: "done",
      localTargetIndex: 1,
      top: 416,
    });
    assert.equal(getTimelineGroupDropTarget(groups, 177).sectionId, "open");
    assert.equal(getTimelineGroupDropTarget(groups, 180).sectionId, "empty");
    assert.equal(getTimelineGroupDropTarget([], 100), null);
  });
  test("ReUI scheduling normalizes clicks and drags to existing day-based date semantics", async () => {
    const { getTimelineScheduleDates } = await loadModule(
      "/src/sections/databases/views/timeline/lib/reui-model.ts",
    );
    const date = new Date(2026, 9, 17, 13, 45);
    const click = getTimelineScheduleDates({ date, allDay: false });
    assert.equal(click.start.getHours(), 0);
    assert.equal(click.start.getDate(), 17);
    assert.equal(click.end.getDate(), 22);
    const drag = getTimelineScheduleDates({
      start: date,
      end: new Date(2026, 9, 20, 16),
      allDay: false,
    });
    assert.equal(drag.end.getDate(), 20);
    const short = getTimelineScheduleDates({
      start: date,
      end: new Date(2026, 9, 17, 14),
      allDay: false,
    });
    assert.equal(short.end.getDate(), 18);
  });
  test("ReUI axis supports all five scales and timezone-safe period navigation", async () => {
    const { getGanttDateRange, stepGanttDate } = await loadModule(
      "/src/components/ui/gantt/gantt-lib.tsx",
    );
    const date = new Date("2026-10-17T10:00:00Z");
    const opts = { timeZone: "Asia/Kolkata", weekStartsOn: 1 };
    for (const scale of ["day", "week", "month", "quarter", "year"]) {
      const { activeRange, visibleRange } = getGanttDateRange(scale, date, opts);
      assert.ok(activeRange.start <= date && date < activeRange.end);
      assert.ok(visibleRange.start <= activeRange.start && visibleRange.end >= activeRange.end);
      const next = stepGanttDate(scale, date, 1, opts);
      assert.ok(next > date);
      assert.equal(stepGanttDate(scale, next, -1, opts).getTime(), date.getTime());
    }
  });
}
