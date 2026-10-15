export function register({ assert, loadModule, test }) {
  test("timeline add rows span every rendered date column", async () => {
    const { getTimelineColumnCount } = await loadModule(
      "/src/components/databases/views/timeline/gantt/gantt-view.tsx",
    );
    const timelineData = [
      {
        year: 2026,
        quarters: [
          { months: [{ days: 31 }, { days: 28 }, { days: 31 }] },
          { months: [{ days: 30 }, { days: 31 }, { days: 30 }] },
          { months: [{ days: 31 }, { days: 31 }, { days: 30 }] },
          { months: [{ days: 31 }, { days: 30 }, { days: 31 }] },
        ],
      },
    ];

    assert.equal(getTimelineColumnCount(timelineData, "daily"), 365);
    assert.equal(getTimelineColumnCount(timelineData, "monthly"), 12);
    assert.equal(getTimelineColumnCount(timelineData, "quarterly"), 12);
  });
}
