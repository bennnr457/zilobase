import { DatabaseRowActionsProvider } from "../../shared/components/database-row-actions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUndoHistory } from "@/app/shortcuts/undo-history";
import { useDatabaseSelection } from "../../shared/hooks/selection";
import { DatabaseSelectionToolbar } from "../../shared/components/database-selection-toolbar";

import { getRawDatabaseGroupValue } from "@zilobase/features/databases";
import { getDatabaseTableGroupSections } from "@zilobase/features/databases";
import { DatabaseRecordWindowControl } from "../../shared/components/database-record-window-control";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../../state/components/database-view-context";
import { getTimelineDatePropertyId, ganttMoveToCellValue } from "@zilobase/features/databases";
import {
  buildTimelineRowItem,
  getGanttStatusForValue,
  type TimelineRowItem,
} from "../lib/presentation-model";
import {
  buildTimelineViewRows,
  getTimelineItems,
  type TimelineGroupSection,
} from "../lib/presentation-model";
import { DatabaseTimelineGrid } from "./database-timeline-grid";
import { DatabaseTimelineSetup } from "./database-timeline-setup";
import { TimelineRowDragLayer } from "./database-timeline-row-drag-layer";
import { useTimelineRowDrag } from "./database-timeline-row-drag";
import { useDatabaseViewBreakout } from "../../shared/hooks/use-database-view-breakout";
import { useTimelineRowLayout } from "../hooks/use-timeline-row-layout";

export function DatabaseTimelineView() {
  const {
    addDraggedPageRow,
    addDatabaseRow,
    onOpenPage,
    savePropertyValue,
    setViewDateProperty,
    setupTimelineDateProperty,
    addTimelineRow,
  } = useDatabaseActionsContext();
  const {
    activeDatabaseFilters,
    activeDatabaseSorts,
    editable,
    databaseId,
    groupProperty,
    hostDatabaseId,
    items,
    personOptions,
    properties,
    propertyValuesByKey,
    sortedItems,
    timelineDateProperties,
    timelineDateProperty,
  } = useDatabaseDataContext();
  const { activeView, showPageIconInTitle, titlePropertyLabel } = useDatabaseUiContext();

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelineBreakoutStyle = useDatabaseViewBreakout(
    timelineRef,
    !sidebarCollapsed,
    timelineDateProperty?.id,
  );

  const propertyValuesByKeyRef = useRef(propertyValuesByKey);
  propertyValuesByKeyRef.current = propertyValuesByKey;
  const undoHistory = useUndoHistory();
  const selection = useDatabaseSelection({
    rows: items,
    propertyValuesByKey,
    propertyValuesByKeyRef,
    savePropertyValue,
    undoHistory,
  });

  useEffect(() => {
    selection.setSelectedRowIds(new Set());
  }, [databaseId, activeView?.id, selection.setSelectedRowIds]);

  const statusProperty = useMemo(
    () => properties.find((property) => property.property.type === "status") ?? null,
    [properties],
  );
  const configuredDatePropertyId = getTimelineDatePropertyId(activeView?.config);
  const isGrouped = Boolean(groupProperty);
  const isFiltered = activeDatabaseFilters.length > 0;
  const isSorted = activeDatabaseSorts.length > 0;

  const personOptionsById = useMemo(
    () => new Map(personOptions.map((option) => [option.id, option.name])),
    [personOptions],
  );
  const rowsById = useMemo(() => new Map(items.map((row) => [row.id, row])), [items]);

  const timelineRowById = useMemo(() => {
    if (!timelineDateProperty) {
      return new Map<string, TimelineRowItem>();
    }

    const rows = new Map<string, TimelineRowItem>();
    const statusByValue = new Map<string, ReturnType<typeof getGanttStatusForValue>>();

    for (const row of sortedItems) {
      const dateValue =
        propertyValuesByKey[`${row.pageId}:${timelineDateProperty.property.id}`] ?? "";
      const statusValue = statusProperty
        ? getRawDatabaseGroupValue(
            propertyValuesByKey[`${row.pageId}:${statusProperty.property.id}`] ?? "",
          )
        : "";
      let status = statusByValue.get(statusValue);

      if (!status) {
        status = getGanttStatusForValue(statusValue, statusProperty);
        statusByValue.set(statusValue, status);
      }

      rows.set(
        row.id,
        buildTimelineRowItem({
          dateValue,
          groupName: "",
          rowId: row.id,
          rowName: row.page.name ?? "Untitled",
          pageId: row.pageId,
          status,
        }),
      );
    }

    return rows;
  }, [propertyValuesByKey, sortedItems, statusProperty, timelineDateProperty]);

  const groupedSections = useMemo<TimelineGroupSection[]>(() => {
    if (!groupProperty) {
      return [];
    }

    return getDatabaseTableGroupSections({
      groupProperty,
      personOptionsById,
      propertyValuesByKey,
      rows: sortedItems,
    });
  }, [groupProperty, personOptionsById, propertyValuesByKey, sortedItems]);

  const viewRows = useMemo(
    () =>
      buildTimelineViewRows({
        collapsedGroups,
        editable,
        groupProperty,
        items: sortedItems,
        sections: groupedSections,
      }),
    [collapsedGroups, editable, groupProperty, groupedSections, sortedItems],
  );

  const visibleRows = useMemo(() => getTimelineItems(viewRows), [viewRows]);
  const visibleRowIds = useMemo(() => visibleRows.map((row) => row.id), [visibleRows]);
  const visibleRowIndexById = useMemo(
    () => new Map(visibleRows.map((row, index) => [row.id, index])),
    [visibleRows],
  );

  const rowMeasureKey = useMemo(
    () => ({ viewRows, sidebarCollapsed, timelineBreakoutStyle }),
    [viewRows, sidebarCollapsed, timelineBreakoutStyle],
  );
  const {
    getDropTargetIndex: getRowDropTargetIndex,
    getGroupDropTarget,
    handleScroll: handleTimelineScroll,
    layout: rowLayout,
    measureRows,
  } = useTimelineRowLayout({
    measureKey: rowMeasureKey,
    rowIds: visibleRowIds,
    timelineRef,
  });

  const rowDragInput = useMemo(
    () => ({
      addDraggedPageRow,
      databaseId,
      editable,
      getDropTargetIndex: getRowDropTargetIndex,
      getGroupDropTarget,
      groupProperty,
      hostDatabaseId,
      groupedSections,
      isFiltered,
      isGrouped,
      isSorted,
      items,
      layout: rowLayout,
      measureRows,
      propertyValuesByKey,
      rowsById,
      sortedItems,
      timelineRef,
      visibleRows,
      visibleRowIndexById,
    }),
    [
      addDraggedPageRow,
      databaseId,
      editable,
      getRowDropTargetIndex,
      getGroupDropTarget,
      groupProperty,
      hostDatabaseId,
      groupedSections,
      isFiltered,
      isGrouped,
      isSorted,
      items,
      measureRows,
      propertyValuesByKey,
      rowLayout,
      rowsById,
      sortedItems,
      visibleRows,
      visibleRowIndexById,
    ],
  );
  const rowDrag = useTimelineRowDrag(rowDragInput);

  const handleSelectRow = useCallback(
    (rowId: string) => {
      const row = rowsById.get(rowId);

      if (row?.pageId) {
        onOpenPage?.(row.pageId);
      }
    },
    [onOpenPage, rowsById],
  );

  const handleMoveFeature = useCallback(
    (id: string, startAt: Date, endAt: Date | null) => {
      if (!timelineDateProperty) {
        return;
      }

      const row = rowsById.get(id);

      if (!row) {
        return;
      }

      const key = `${row.pageId}:${timelineDateProperty.property.id}`;
      const currentValue = propertyValuesByKey[key] ?? "";
      savePropertyValue(
        row.id,
        timelineDateProperty.property.id,
        "date",
        currentValue,
        ganttMoveToCellValue(startAt, endAt),
      );
    },
    [propertyValuesByKey, rowsById, savePropertyValue, timelineDateProperty],
  );

  const toggleGroupCollapsed = useCallback((sectionId: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }, []);

  const sidebarCellProps = useMemo(
    () => ({
      collapsedGroups,
      databaseId,
      editable,
      groupProperty,
      onAddPage: addDatabaseRow,
      onOpenPage,
      onRowMouseEnter: rowDrag.setHoveredRowId,
      onToggleGroup: toggleGroupCollapsed,
      showPageIcon: showPageIconInTitle,
    }),
    [
      addDatabaseRow,
      collapsedGroups,
      databaseId,
      editable,
      groupProperty,
      onOpenPage,
      rowDrag.setHoveredRowId,
      showPageIconInTitle,
      toggleGroupCollapsed,
    ],
  );
  if (!timelineDateProperty) {
    return (
      <DatabaseTimelineSetup
        configuredDatePropertyId={configuredDatePropertyId}
        dateProperties={timelineDateProperties}
        editable={editable}
        onSelectDateProperty={setViewDateProperty}
        onSetupDateProperty={setupTimelineDateProperty}
      />
    );
  }

  return (
    <DatabaseRowActionsProvider selection={selection}>
      {editable && selection.selectedRows.length > 0 ? (
        <DatabaseSelectionToolbar
          clearSelection={() => selection.setSelectedRowIds(new Set())}
          selectedCount={selection.selectedRows.length}
        />
      ) : null}
      <div
        className="database-timeline-view min-h-0 overflow-visible"
        data-sidebar-collapsed={sidebarCollapsed ? "true" : undefined}
        onDragLeave={rowDrag.handleDragLeave}
        onDragOver={rowDrag.handleDragOver}
        onDrop={rowDrag.handleDrop}
        onMouseLeave={() => {
          if (!rowDrag.draggedRowId) rowDrag.setHoveredRowId(null);
        }}
        onMouseOver={(event) => {
          const row = (event.target as HTMLElement).closest<HTMLElement>("[data-gantt-row-id]");
          if (row && rowsById.has(row.dataset.ganttRowId ?? ""))
            rowDrag.setHoveredRowId(row.dataset.ganttRowId!);
        }}
        onScrollCapture={handleTimelineScroll}
        ref={timelineRef}
        style={timelineBreakoutStyle}
      >
        <TimelineRowDragLayer
          controller={rowDrag}
          rowsById={rowsById}
          selectedRowIds={selection.selectedRowIds}
          onSelectedRowChange={selection.toggleSelectedRow}
          editable={editable}
          layout={rowLayout}
          sidebarCollapsed={sidebarCollapsed}
        />
        <DatabaseTimelineGrid
          addTimelineItem={addTimelineRow}
          selectedRowIds={selection.selectedRowIds}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarCollapsedChange={setSidebarCollapsed}
          onMoveItem={handleMoveFeature}
          onSelectItem={handleSelectRow}
          sidebarCellProps={sidebarCellProps}
          timelineItemsById={timelineRowById}
          titlePropertyLabel={titlePropertyLabel}
          viewRows={viewRows}
        />
      </div>
      <DatabaseRecordWindowControl />
    </DatabaseRowActionsProvider>
  );
}
