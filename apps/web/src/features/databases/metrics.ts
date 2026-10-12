import { emitDatabaseMetric } from "./lifecycle/metrics";

export function markDatabaseInteractionPaint(startedAt: number) {
  requestAnimationFrame(() => {
    emitDatabaseMetric("drag_to_paint", performance.now() - startedAt);
  });
}
