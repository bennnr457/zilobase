import { memo, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, Plus } from "@/components/icons";

import { getColorTokenBadgeClassName, getColorTokenDotClassName } from "@/lib/color-tokens";

import { databaseNameColumnDefaultWidth } from "../../lib/column-dimensions";
import { DatabasePageLink } from "../../../interactions/components/database-page-link";
import type { DatabasePropertyListItem } from "@zilobase/features/databases";
import { DatabaseCellContent } from "../../shared/components/database-cell-content";
import type { TimelineViewRow } from "../lib/presentation-model";

const timelineTableMinWidth = databaseNameColumnDefaultWidth;

export const timelineTableStyle = {
  "--database-table-min-width": `${timelineTableMinWidth}px`,
} as CSSProperties;

export function TimelineNameHeaderRow({ label }: { label: string }) {
  return (
    <div className="database-timeline-sidebar-name-header">
      <span className="database-name-header-content">
        <span>Aa</span>
        <span>{label}</span>
      </span>
    </div>
  );
}

export type TimelineSidebarRowCellProps = {
  collapsedGroups: Record<string, boolean>;
  databaseId: string | null | undefined;
  editable: boolean;
  groupProperty: DatabasePropertyListItem | null;
  onAddPage: (groupValue?: string, groupProperty?: DatabasePropertyListItem | null) => void;
  onOpenPage?: (pageId: string) => void;
  onRowMouseEnter?: (rowId: string) => void;
  onToggleGroup: (sectionId: string) => void;
  showPageIcon: boolean;
  viewRow: TimelineViewRow;
};

export const TimelineSidebarRowCell = memo(function TimelineSidebarRowCell({
  collapsedGroups,
  databaseId,
  editable,
  groupProperty,
  onAddPage,
  onOpenPage,
  onRowMouseEnter,
  onToggleGroup,
  showPageIcon,
  viewRow,
}: TimelineSidebarRowCellProps) {
  if (viewRow.kind === "group-header") {
    const isCollapsed = collapsedGroups[viewRow.section.id] === true;

    return (
      <div
        className="database-timeline-sidebar-cell"
        data-timeline-group-header={viewRow.section.id}
        data-roadmap-ui="gantt-sidebar"
        style={timelineTableStyle}
      >
        <button
          aria-expanded={!isCollapsed}
          className="database-table-group-toggle database-timeline-group-toggle"
          onClick={() => onToggleGroup(viewRow.section.id)}
          type="button"
        >
          {isCollapsed ? (
            <ChevronRight className="size-4 shrink-0" />
          ) : (
            <ChevronDown className="size-4 shrink-0" />
          )}
          <span className={getColorTokenBadgeClassName(viewRow.section.color)}>
            <span aria-hidden="true" className={getColorTokenDotClassName(viewRow.section.color)} />
            {viewRow.section.name}
          </span>
          <span className="database-table-group-count">{viewRow.section.rows.length}</span>
        </button>
      </div>
    );
  }

  if (viewRow.kind === "new-page") {
    return (
      <div
        className="database-timeline-sidebar-cell database-timeline-sidebar-create-row"
        data-database-row-drop-footer
        data-timeline-group-footer={viewRow.section?.id}
        data-roadmap-ui="gantt-sidebar"
        style={timelineTableStyle}
      >
        <button
          className="database-table-create"
          disabled={!databaseId}
          onClick={() => onAddPage(viewRow.section?.groupValue, groupProperty)}
          type="button"
        >
          <Plus />
          <span>New page</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="database-timeline-sidebar-cell"
      data-roadmap-ui="gantt-sidebar"
      style={timelineTableStyle}
    >
      <div
        className="database-timeline-sidebar-row"
        data-timeline-row-id={viewRow.item.id}
        data-timeline-group-id={viewRow.sectionId}
        onMouseEnter={() => onRowMouseEnter?.(viewRow.item.id)}
      >
        <DatabaseCellContent wrapContent={false}>
          <DatabasePageLink
            editable={editable}
            onOpen={onOpenPage}
            pageId={viewRow.item.pageId}
            pageSummary={viewRow.item.page}
            showPageIcon={showPageIcon}
          />
        </DatabaseCellContent>
      </div>
    </div>
  );
});
