import {
  calendarCapability,
  calendarEventKey,
  calendarSelectionKey,
  dayInstant,
  type CalendarEvent as GoogleEvent,
  type CalendarPreferences,
  type CalendarRecord,
} from "@zilobase/features/calendar";
import type {
  CalendarEvent,
  EventCalendarProposedUpdate,
  EventCalendarSlotDraft,
  EventCalendarSlotInfo,
} from "@/components/ui/event-calendar/event-calendar-types";
import { getDayKey, toZoned } from "@/components/ui/event-calendar/event-calendar-lib";
import { getPaletteColor, type ColorTokenId } from "@/lib/color-tokens";
import { addDays, addMinutes, startOfDay } from "date-fns";

const providerHues: ColorTokenId[] = [
  "blue",
  "purple",
  "green",
  "purple",
  "red",
  "yellow",
  "orange",
  "blue",
  "gray",
  "blue",
  "green",
  "red",
];

export function googleCalendarEvent(
  event: GoogleEvent,
  calendar: CalendarRecord | undefined,
  preferences: CalendarPreferences,
  online: boolean,
  pending = false,
): CalendarEvent<GoogleEvent> | null {
  const start = new Date(
    event.start.date ? dayInstant(event.start.date, preferences.timeZone) : event.start.dateTime!,
  );
  const end = new Date(
    event.end.date ? dayInstant(event.end.date, preferences.timeZone) : event.end.dateTime!,
  );
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start)
    return null;
  const override =
    preferences.calendarColors[calendarSelectionKey(event.bindingId, event.calendarId)];
  const providerColor = event.colorId ?? calendar?.colorId;
  const color =
    !event.colorId && override
      ? override
      : (providerHues[Number(providerColor ?? 0) % providerHues.length] ?? "blue");
  return {
    id: calendarEventKey(event),
    title: event.title.trim() || "Untitled",
    start,
    end,
    allDay: Boolean(event.start.date),
    color: getPaletteColor(color) ?? undefined,
    readOnly:
      !online || pending || !calendarCapability("update", calendar?.permissions, event).allowed,
    // Google range queries already expand instances. Never give ReUI an RRULE.
    data: event,
  };
}

export function googleSlotRange(
  slot: EventCalendarSlotInfo | EventCalendarSlotDraft,
  zone: string,
) {
  if ("start" in slot) return { start: slot.start, end: slot.end, allDay: slot.allDay };
  const start = slot.allDay ? startOfDay(toZoned(slot.date, zone)) : slot.date;
  return {
    start,
    end: slot.allDay ? addDays(toZoned(start, zone), 1) : addMinutes(start, 60),
    allDay: slot.allDay,
  };
}

export function googleEventTiming(
  range: { start: Date; end: Date; allDay: boolean },
  displayZone: string,
  event?: GoogleEvent,
): Pick<GoogleEvent, "start" | "end"> {
  if (range.allDay)
    return {
      start: { date: getDayKey(range.start, displayZone) },
      end: { date: getDayKey(range.end, displayZone) },
    };
  const timeZone = event?.start.timeZone ?? displayZone;
  return {
    start: { dateTime: range.start.toISOString(), timeZone },
    end: { dateTime: range.end.toISOString(), timeZone: event?.end.timeZone ?? timeZone },
  };
}

export function googleEventProposal(
  update: EventCalendarProposedUpdate<GoogleEvent>,
  zone: string,
) {
  const event = update.event.data;
  return event ? { ...event, ...googleEventTiming(update, zone, event) } : null;
}
