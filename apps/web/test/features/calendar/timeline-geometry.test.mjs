export async function register({ assert, loadModule, test }) {
  const { timelineGeometry, timelineRetargets, snapTimelineOffset } = await loadModule(
    "/src/components/calendar/primitives/timeline-geometry.ts",
  );
  test("fractional anchor survives prepend and resize", () => {
    const before = timelineGeometry("2026-09-01", 143.25);
    const anchor = before.anchor(1500.75, 420);
    const after = timelineGeometry("2026-08-01", 167.5);
    const restored = after.anchor(after.restore(anchor), anchor.minute);
    assert.equal(restored.date, anchor.date);
    assert.ok(Math.abs(restored.fraction - anchor.fraction) < 1e-10);
  });
  test("passive visible dates do not retarget; explicit navigation does", () => {
    assert.equal(timelineRetargets(null, "2026-09-09", null), true);
    assert.equal(timelineRetargets("2026-09-07", "2026-09-16", "2026-09-16"), false);
    assert.equal(timelineRetargets("2026-09-07", "2026-09-16", "2026-09-09"), true);
    assert.equal(timelineRetargets("2026-09-16", "2026-09-16", "2026-09-16"), false);
  });
  test("timeline offsets snap to the nearest civil-date column", () => {
    assert.equal(snapTimelineOffset(0, 140), null); // on boundary
    assert.equal(snapTimelineOffset(1, 140), null); // within dead-zone
    assert.equal(snapTimelineOffset(69, 140), 0);
    assert.equal(snapTimelineOffset(70, 140), 140);
    assert.equal(snapTimelineOffset(209, 140), 140);
    assert.equal(snapTimelineOffset(211, 140), 280);
    assert.equal(snapTimelineOffset(140, 140), null); // exactly on boundary
    assert.equal(snapTimelineOffset(141, 140), null); // within dead-zone
    assert.equal(snapTimelineOffset(-1, 140), null); // negative within dead-zone
  });
}
