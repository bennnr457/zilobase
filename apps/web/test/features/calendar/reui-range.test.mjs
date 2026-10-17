export function register({ assert, loadModule, test }) {
  test("ReUI range requests cover all six Month weeks and exactly thirty Agenda dates", async () => {
    const { calendarDestinationRange } = await loadModule(
      "/src/sections/calendar/workspace/hooks/calendar-navigation.ts",
    );
    const { defaultCalendarPreferences } = await loadModule(
      "/packages/features/src/calendar/model.ts",
    );
    const preferences = defaultCalendarPreferences("Asia/Kolkata");
    assert.deepEqual(calendarDestinationRange({ date: "2026-09-09", view: "month" }, preferences), {
      start: "2026-08-30T18:30:00.000Z",
      end: "2026-10-11T18:30:00.000Z",
    });
    assert.deepEqual(
      calendarDestinationRange({ date: "2026-09-09", view: "agenda" }, preferences),
      { start: "2026-09-08T18:30:00.000Z", end: "2026-10-08T18:30:00.000Z" },
    );
    assert.deepEqual(
      calendarDestinationRange(
        { date: "2026-09-09", view: "week", days: 3, align: true },
        preferences,
      ),
      calendarDestinationRange({ date: "2026-09-09", view: "week" }, preferences),
    );
  });
}
