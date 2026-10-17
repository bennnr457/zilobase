import { addDays, startOfDay } from "date-fns";
import type {
  GanttSlotDraft,
  GanttSlotInfo,
  GanttEvent,
  GanttResource,
} from "@/components/ui/gantt/gantt-types";
import { DEFAULT_TIMELINE_ITEM_DURATION_DAYS } from "@zilobase/features/databases";
import {
  getTimelineViewRowHeight,
  getTimelineViewRowKey,
  type TimelineRowItem,
  type TimelineViewRow,
} from "./presentation-model";

/** Both panes use this exact sequence, including unscheduled and structural rows. */
export function buildTimelineGanttModel(
  rows: TimelineViewRow[],
  itemsById: ReadonlyMap<string, TimelineRowItem>,
  editable: boolean,
) {
  const rowsByResourceId = new Map<string, TimelineViewRow>();
  const resources: GanttResource[] = [];
  const events: GanttEvent[] = [];
  for (const row of rows) {
    const id = row.kind === "item" ? row.item.id : `timeline:${getTimelineViewRowKey(row)}`;
    rowsByResourceId.set(id, row);
    const item = row.kind === "item" ? itemsById.get(row.item.id) : undefined;
    resources.push({ id, title: item?.name ?? "", scheduleMode: "single" });
    if (item?.feature) {
      events.push({
        id: item.id,
        resourceId: id,
        title: item.name,
        start: item.feature.startAt,
        end: item.feature.endAt ?? item.feature.startAt,
        allDay: true,
        color: item.status.color,
        readOnly: !editable,
      });
    }
  }
  return { resources, events, rowsByResourceId };
}

export function getTimelineResourceHeight(row: TimelineViewRow | undefined) {
  return row ? getTimelineViewRowHeight(row) / 16 : 2;
}

/** Existing timeline properties are day-based; ReUI's day scale can propose times. */
export function getTimelineScheduleDates(slot: GanttSlotDraft | GanttSlotInfo) {
  const start = startOfDay("start" in slot ? slot.start : slot.date);
  const end =
    "start" in slot
      ? new Date(Math.max(startOfDay(slot.end).getTime(), addDays(start, 1).getTime()))
      : addDays(start, DEFAULT_TIMELINE_ITEM_DURATION_DAYS);
  return { start, end };
}
