export type CalendarBuffers = {
  before: number;
  after: number;
  monthBefore: number;
  monthAfter: number;
};
export const DEFAULT_CALENDAR_BUFFERS: CalendarBuffers = {
  before: 28,
  after: 28,
  monthBefore: 56,
  monthAfter: 56,
};
export function normalizeCalendarBuffers(value: unknown): CalendarBuffers {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_CALENDAR_BUFFERS).map(([key, fallback]) => [
      key,
      typeof input[key] === "number" && Number.isInteger(input[key])
        ? Math.max(7, Math.min(180, input[key]))
        : fallback,
    ]),
  ) as CalendarBuffers;
}
