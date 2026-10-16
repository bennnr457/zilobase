import { visibleDateRank, dateFromRank } from "@zilobase/features/calendar";
export type TimelineAnchor = { date: string; fraction: number; minute: number };

export function timelineGeometry(origin: string, size: number, weekends = true) {
  if (!(size > 0)) throw new Error("Timeline item size must be positive");
  const base = visibleDateRank(origin, weekends);
  return {
    dateToPosition: (date: string) => (visibleDateRank(date, weekends) - base) * size,
    positionToDate: (position: number) =>
      dateFromRank(base + Math.floor(position / size), weekends),
    anchor(position: number, minute = 0): TimelineAnchor {
      const offset = position / size;
      return {
        date: dateFromRank(base + Math.floor(offset), weekends),
        fraction: offset - Math.floor(offset),
        minute,
      };
    },
    restore: (anchor: TimelineAnchor) =>
      (visibleDateRank(anchor.date, weekends) - base + anchor.fraction) * size,
  };
}
/** Passive scroll updates keep the visual origin; only explicit date changes jump. */
export function timelineRetargets(
  previousDate: string | null,
  date: string,
  emitted: string | null,
) {
  return previousDate == null || (previousDate !== date && date !== emitted);
}
/** Minimum px displacement to bother snapping. Below this, accept current position. */
const SNAP_DEAD_ZONE = 2;

export function snapTimelineOffset(offset: number, size: number): number | null {
  if (!(size > 0)) return null;
  const snapped = Math.round(offset / size) * size;
  return Math.abs(offset - snapped) <= SNAP_DEAD_ZONE ? null : snapped;
}
export const timeToPosition = (minute: number, hourHeight: number) => (minute * hourHeight) / 60;
export const positionToTime = (position: number, hourHeight: number) =>
  (position * 60) / hourHeight;
