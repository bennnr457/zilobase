import {
  parseRowDateRange,
  getTimelineStatusForValue,
  canCreateRowInGroup,
  type DatabasePropertyListItem,
  type DatabasePropertyValue,
  type DatabaseTableGroupSection,
  type SortableDatabaseItem,
} from "@zilobase/features/databases";
import { getPaletteColor } from "@/lib/color-tokens";

export type GanttStatus = { id: string; name: string; color: string };
export type GanttFeature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date | null;
  status: GanttStatus;
};
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

export const TIMELINE_ROW_HEIGHT = 32;

export const TIMELINE_GROUP_HEADER_HEIGHT = 40;

export type TimelineGroupSection = DatabaseTableGroupSection<SortableDatabaseItem>;

export type TimelineViewRow =
  | {
      item: SortableDatabaseItem;
      kind: "item";
      sectionId?: string;
    }
  | {
      kind: "group-header";
      section: TimelineGroupSection;
    }
  | {
      kind: "new-page";
      section?: TimelineGroupSection;
    };

type BuildTimelineViewRowsInput = {
  collapsedGroups: Record<string, boolean>;
  editable: boolean;
  groupProperty: DatabasePropertyListItem | null;
  items: SortableDatabaseItem[];
  sections: TimelineGroupSection[];
};

export function buildTimelineViewRows({
  collapsedGroups,
  editable,
  groupProperty,
  items,
  sections,
}: BuildTimelineViewRowsInput): TimelineViewRow[] {
  if (!groupProperty) {
    return buildUngroupedRows(items, editable);
  }

  return sections.flatMap((section) =>
    buildGroupRows({
      collapsed: collapsedGroups[section.id] === true,
      editable,
      groupProperty,
      section,
    }),
  );
}

export function getTimelineViewRowHeight(row: TimelineViewRow) {
  switch (row.kind) {
    case "group-header":
      return TIMELINE_GROUP_HEADER_HEIGHT;
    default:
      return TIMELINE_ROW_HEIGHT;
  }
}

export function getTimelineViewRowKey(row: TimelineViewRow) {
  switch (row.kind) {
    case "item":
      return `item-${row.item.id}`;
    case "group-header":
      return `group-${row.section.id}`;
    case "new-page":
      return `new-page-${row.section?.id ?? "ungrouped"}`;
  }
}

export function getTimelineItems(rows: TimelineViewRow[]) {
  return rows.flatMap((row) => (row.kind === "item" ? [row.item] : []));
}

function buildUngroupedRows(items: SortableDatabaseItem[], editable: boolean): TimelineViewRow[] {
  const rows: TimelineViewRow[] = items.map((item) => ({ item, kind: "item" }));

  if (editable) {
    rows.push({ kind: "new-page" });
  }

  return rows;
}

function buildGroupRows({
  collapsed,
  editable,
  groupProperty,
  section,
}: {
  collapsed: boolean;
  editable: boolean;
  groupProperty: DatabasePropertyListItem;
  section: TimelineGroupSection;
}): TimelineViewRow[] {
  const rows: TimelineViewRow[] = [{ kind: "group-header", section }];

  if (collapsed) {
    return rows;
  }

  rows.push(
    ...section.rows.map((item): TimelineViewRow => ({ item, kind: "item", sectionId: section.id })),
  );

  if (editable && !section.isEmpty && canCreateRowInGroup(groupProperty)) {
    rows.push({ kind: "new-page", section });
  }

  return rows;
}
