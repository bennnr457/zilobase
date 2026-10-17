import { memo, useCallback, useMemo } from "react";
import { Gantt } from "@/components/ui/gantt/gantt";
import { GanttView } from "@/components/ui/gantt/gantt-view";
import type {
  GanttOccurrence,
  GanttResource,
  GanttSlotDraft,
  GanttSlotInfo,
} from "@/components/ui/gantt/gantt-types";
import type { DatabasePropertyListItem } from "@zilobase/features/databases";
import { databaseNameColumnDefaultWidth } from "../../lib/column-dimensions";
import {
  TimelineNameHeaderRow,
  TimelineSidebarRowCell,
  type TimelineSidebarRowCellProps,
} from "./database-timeline-sidebar";
import { type TimelineViewRow, type TimelineRowItem } from "../lib/presentation-model";
import {
  buildTimelineGanttModel,
  getTimelineResourceHeight,
  getTimelineScheduleDates,
} from "../lib/reui-model";
import { DatabaseTimelineToolbarChrome } from "./database-timeline-toolbar";

type TimelineGridProps = {
  addTimelineItem: (
    start: Date,
    end: Date,
    groupValue?: string,
    groupProperty?: DatabasePropertyListItem | null,
  ) => void;
  onMoveItem: (id: string, start: Date, end: Date | null) => void;
  onSelectItem: (rowId: string) => void;
  sidebarCellProps: Omit<TimelineSidebarRowCellProps, "viewRow">;
  timelineItemsById: Map<string, TimelineRowItem>;
  titlePropertyLabel: string;
  viewRows: TimelineViewRow[];
  selectedRowIds: Set<string>;
  sidebarCollapsed: boolean;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
};

export const DatabaseTimelineGrid = memo(function DatabaseTimelineGrid({
  addTimelineItem,
  onMoveItem,
  onSelectItem,
  sidebarCellProps,
  timelineItemsById,
  titlePropertyLabel,
  viewRows,
  selectedRowIds,
  sidebarCollapsed,
  onSidebarCollapsedChange,
}: TimelineGridProps) {
  const { editable, databaseId } = sidebarCellProps;
  const model = useMemo(
    () => buildTimelineGanttModel(viewRows, timelineItemsById, editable),
    [viewRows, timelineItemsById, editable],
  );
  const getRow = useCallback(
    (resource: GanttResource) => model.rowsByResourceId.get(resource.id),
    [model],
  );
  const canScheduleResource = useCallback(
    (resource: GanttResource) => {
      const row = getRow(resource);
      return Boolean(editable && databaseId && (row?.kind === "new-page" || row?.kind === "item"));
    },
    [getRow, editable, databaseId],
  );
  const schedule = useCallback(
    (slot: GanttSlotDraft | GanttSlotInfo) => {
      if (!editable || !databaseId || !slot.resourceId) return;
      const row = model.rowsByResourceId.get(slot.resourceId);
      const { start, end } = getTimelineScheduleDates(slot);
      if (row?.kind === "item") {
        onMoveItem(row.item.id, start, end);
      } else if (row?.kind === "new-page") {
        addTimelineItem(start, end, row.section?.groupValue, sidebarCellProps.groupProperty);
      }
    },
    [editable, databaseId, model, onMoveItem, addTimelineItem, sidebarCellProps.groupProperty],
  );
  const renderResourceRow = useCallback(
    (resource: GanttResource) => {
      const row = getRow(resource);
      return row ? <TimelineSidebarRowCell {...sidebarCellProps} viewRow={row} /> : null;
    },
    [getRow, sidebarCellProps],
  );
  const getResourceRowHeight = useCallback(
    (resource: GanttResource) => getTimelineResourceHeight(getRow(resource)),
    [getRow],
  );
  const getResourceRowClassName = useCallback(
    (resource: GanttResource) => {
      const kind = getRow(resource)?.kind;
      if (kind === "group-header") return "database-timeline-group-track bg-surface-subtle";
      return undefined;
    },
    [getRow],
  );
  const renderTreeHeader = useCallback(
    () => <TimelineNameHeaderRow label={titlePropertyLabel} />,
    [titlePropertyLabel],
  );
  const renderEvent = useCallback(
    ({ occurrence }: { occurrence: GanttOccurrence }) => {
      const item = timelineItemsById.get(String(occurrence.eventId));
      return (
        <span
          className="block w-full truncate"
          data-open-in-new-tab-href={item ? `/p/${encodeURIComponent(item.pageId)}` : undefined}
          data-open-in-new-tab-title={item?.name}
        >
          {occurrence.event.title}
        </span>
      );
    },
    [timelineItemsById],
  );
  const selectedRows = useMemo(() => [...selectedRowIds], [selectedRowIds]);

  return (
    <Gantt
      className="database-timeline-gantt h-auto gap-0"
      defaultScale="month"
      resources={model.resources}
      events={model.events}
      selectedRows={selectedRows}
      rowCheckboxes={false}
      scheduleMode="single"
      summaryBars={false}
      baselineBars={false}
      dependencyLines={false}
      scrollbars="native"
      verticalScroll="page"
      timelineLines="both"
      metrics={{ minRowHeight: 2, laneHeight: 1.5, rowPadding: 0.25, ghostHeight: 1.5 }}
      treePanel={{
        width: databaseNameColumnDefaultWidth,
        nameColumnWidth: databaseNameColumnDefaultWidth,
        minWidth: databaseNameColumnDefaultWidth,
        maxWidth: databaseNameColumnDefaultWidth,
        resizable: false,
        hidden: sidebarCollapsed,
      }}
      slotDuration={24 * 60}
      snapDuration={24 * 60}
      interactions={{ drag: editable, resize: editable, selectSlot: editable }}
      renderResourceRow={renderResourceRow}
      renderEvent={renderEvent}
      renderTreeHeader={renderTreeHeader}
      getResourceRowHeight={getResourceRowHeight}
      getResourceRowClassName={getResourceRowClassName}
      canScheduleResource={canScheduleResource}
      displayScheduleHint={editable}
      dragCreate={editable}
      canSelectSlot={(slot) => {
        const row = model.rowsByResourceId.get(slot.resourceId ?? "");
        return Boolean(
          editable && databaseId && (row?.kind === "new-page" || row?.kind === "item"),
        );
      }}
      onSlotClick={(slot) => schedule(slot)}
      onSelectSlot={(slot) => schedule(slot)}
      onEventUpdate={(update) => {
        if (!editable || !databaseId || !timelineItemsById.has(String(update.event.id)))
          return false;
        const { start, end } = getTimelineScheduleDates({
          start: update.start,
          end: update.end,
          allDay: true,
        });
        onMoveItem(String(update.event.id), start, end);
        return { start, end, allDay: true };
      }}
      onEventClick={(occurrence) => onSelectItem(String(occurrence.eventId))}
    >
      <DatabaseTimelineToolbarChrome
        sidebarCollapsed={sidebarCollapsed}
        onSidebarCollapsedChange={onSidebarCollapsedChange}
      />
      <GanttView />
    </Gantt>
  );
});
