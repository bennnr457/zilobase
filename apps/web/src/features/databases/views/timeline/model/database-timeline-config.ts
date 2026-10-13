import { parseRowDateRange } from "@zilobase/features/databases/models";

import type { GanttFeature, GanttStatus } from "../gantt";

import { getPaletteColor } from "@/shared/lib/color-tokens";

import { getTimelineStatusForValue } from "@zilobase/features/databases/models";
import { type DatabasePropertyListItem } from "@zilobase/features/databases/models";
import { type DatabasePropertyValue } from "@zilobase/features/databases/models";

export const UNSCHEDULED_GROUP_NAME = "Unscheduled";

const defaultGanttStatus: GanttStatus = {
  ...getTimelineStatusForValue("", null),
  color: getPaletteColor("gray")!,
};

export type TimelineRowItem = {
  feature: GanttFeature | null;
  groupName: string;
  id: string;
  name: string;
  pageId: string;
  status: GanttStatus;
};

export function getGanttStatusForValue(
  statusValue: string,
  statusProperty: DatabasePropertyListItem | null,
): GanttStatus {
  if (!statusValue.trim()) return defaultGanttStatus;
  const status = getTimelineStatusForValue(statusValue, statusProperty);
  return { ...status, color: getPaletteColor(status.color)! };
}

export function buildTimelineRowItem({
  dateValue,
  groupName,
  rowId,
  rowName,
  pageId,
  status,
}: {
  dateValue: DatabasePropertyValue;
  groupName: string;
  rowId: string;
  rowName: string;
  pageId: string;
  status: GanttStatus;
}): TimelineRowItem {
  const dateRange = parseRowDateRange(dateValue);
  const name = rowName.trim() || "Untitled";

  if (!dateRange) {
    return {
      feature: null,
      groupName,
      id: rowId,
      name,
      pageId,
      status,
    };
  }

  return {
    feature: {
      endAt: dateRange.endAt,
      id: rowId,
      name,
      startAt: dateRange.startAt,
      status,
    },
    groupName,
    id: rowId,
    name,
    pageId,
    status,
  };
}

export function groupTimelineRows(rows: TimelineRowItem[]) {
  const groupedRows = new Map<string, TimelineRowItem[]>();

  for (const row of rows) {
    const existingRows = groupedRows.get(row.groupName) ?? [];
    existingRows.push(row);
    groupedRows.set(row.groupName, existingRows);
  }

  return [...groupedRows.entries()]
    .sort(([nameA], [nameB]) => {
      if (nameA === UNSCHEDULED_GROUP_NAME) {
        return 1;
      }

      if (nameB === UNSCHEDULED_GROUP_NAME) {
        return -1;
      }

      return nameA.localeCompare(nameB);
    })
    .map(([groupName, items]) => ({
      groupName,
      items,
    }));
}
