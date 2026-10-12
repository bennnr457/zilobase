import { Temporal } from "@js-temporal/polyfill";

const epoch = Temporal.PlainDate.from("1970-01-05"); // Monday
export type TimelineAnchor = { date: string; fraction: number; minute: number };
export type TimelineCoverage = { start: string; end: string };
export const civilDayOrdinal = (date: string) => epoch.until(Temporal.PlainDate.from(date)).days;
export const dateFromOrdinal = (ordinal: number) => epoch.add({ days: ordinal }).toString();
export function visibleDateRank(date: string, weekends = true) {
  const ordinal = civilDayOrdinal(date);
  if (weekends) return ordinal;
  const week = Math.floor(ordinal / 7),
    weekday = ordinal - week * 7;
  return week * 5 + Math.min(weekday, 4);
}
export function dateFromRank(rank: number, weekends = true) {
  const week = Math.floor(rank / 5);
  return dateFromOrdinal(weekends ? rank : week * 7 + rank - week * 5);
}
/** Extend only through complete adjacent items; never infer readiness from event count. */
export function contiguousTimeline(
  anchor: number,
  count: number,
  ready: (index: number) => boolean,
) {
  if (!ready(anchor)) return { first: anchor, last: anchor - 1 };
  let first = anchor,
    last = anchor;
  while (first > 0 && ready(first - 1)) first--;
  while (last + 1 < count && ready(last + 1)) last++;
  return { first, last };
}
