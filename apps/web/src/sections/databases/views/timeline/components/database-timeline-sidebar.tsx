import { memo, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "@/components/icons";
import { useDataGrid } from "@/components/ui/data-grid/data-grid";
import {
  DataGridTableBody,
  DataGridTableBodyRow,
  DataGridTableHead,
  DataGridTableHeadRow,
} from "@/components/ui/data-grid/data-grid-table";
import type { GanttTreeRowRenderData } from "@/components/ui/gantt/gantt";
import { getColorTokenBadgeClassName, getColorTokenDotClassName } from "@/lib/color-tokens";
import { databaseNameColumnDefaultWidth } from "../../lib/column-dimensions";
import { DatabasePageLink } from "../../../interactions/components/database-page-link";
import { NameColumnGlyph } from "../../../interactions/components/name-column-glyph";
import type { DatabasePropertyListItem } from "@zilobase/features/databases";
import { DatabaseCellContent } from "../../shared/components/database-cell-content";
import { DatabaseTable } from "../../table/components/database-table-shell";
import {
  CreateDatabaseRowButton,
  DatabaseActiveTableCell,
} from "../../table/components/database-table-cell";
import type { DatabaseGridRow } from "../../table/hooks/use-database-grid";
import type { TimelineViewRow } from "../lib/presentation-model";

const columnKeys = ["name"];
const columnWidths = { name: databaseNameColumnDefaultWidth };

function TimelineTable({ children }: { children: ReactNode }) {
  return (
    <DatabaseTable
      columnKeys={columnKeys}
      columnWidths={columnWidths}
      tableMinWidth={databaseNameColumnDefaultWidth}
    >
      {children}
    </DatabaseTable>
  );
}

export function TimelineNameHeaderRow({ label }: { label: string }) {
  return (
    <div className="database-timeline-sidebar-name-header">
      <TimelineTable>
        <DataGridTableHead>
          <DataGridTableHeadRow rowId="timeline-name-header">
            <th className="database-name-header" role="columnheader">
              <span className="database-name-header-content">
                <NameColumnGlyph />
                <span>{label}</span>
              </span>
            </th>
          </DataGridTableHeadRow>
        </DataGridTableHead>
      </TimelineTable>
    </div>
  );
}

export type TimelineSidebarProps = {
  collapsedGroups: Record<string, boolean>;
  databaseId: string | null | undefined;
  editable: boolean;
  groupProperty: DatabasePropertyListItem | null;
  onAddPage: (groupValue?: string, groupProperty?: DatabasePropertyListItem | null) => void;
  onOpenPage?: (pageId: string) => void;
  onRowMouseEnter?: (rowId: string) => void;
  onToggleGroup: (sectionId: string) => void;
  showPageIcon: boolean;
};

export const TimelineSidebarRows = memo(function TimelineSidebarRows({
  collapsedGroups,
  databaseId,
  editable,
  groupProperty,
  onAddPage,
  onOpenPage,
  onRowMouseEnter,
  onToggleGroup,
  showPageIcon,
  rows,
  rowsByResourceId,
  titleEditRequest,
  onTitleEditRequestHandled,
}: TimelineSidebarProps & {
  rows: GanttTreeRowRenderData[];
  rowsByResourceId: ReadonlyMap<string, TimelineViewRow>;
  titleEditRequest: { rowId: string; id: number; initialText?: string } | null;
  onTitleEditRequestHandled: (id: number) => void;
}) {
  const { table } = useDataGrid<DatabaseGridRow>();
  return (
    <TimelineTable>
      <DataGridTableBody>
        {rows.map(({ resource, heightRem, selected }) => {
          const viewRow = rowsByResourceId.get(resource.id);
          if (!viewRow) return null;
          const rowProps = {
            "data-slot": "gantt-row-group",
            "data-gantt-row-id": resource.id,
            "data-selected": selected || undefined,
            "data-roadmap-ui": "gantt-sidebar",
            style: { height: `${heightRem}rem` },
          };
          if (viewRow.kind === "group-header") {
            const isCollapsed = collapsedGroups[viewRow.section.id] === true;
            return (
              <tr {...rowProps} key={resource.id} data-timeline-group-header={viewRow.section.id}>
                <td className="p-0">
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
                      <span
                        aria-hidden="true"
                        className={getColorTokenDotClassName(viewRow.section.color)}
                      />
                      {viewRow.section.name}
                    </span>
                    <span className="database-table-group-count">
                      {viewRow.section.rows.length}
                    </span>
                  </button>
                </td>
              </tr>
            );
          }
          if (viewRow.kind === "new-page") {
            return (
              <CreateDatabaseRowButton
                key={resource.id}
                columnCount={1}
                disabled={!databaseId}
                onClick={() => onAddPage(viewRow.section?.groupValue, groupProperty)}
                rowProps={{
                  ...rowProps,
                  className: "database-timeline-sidebar-create-row",
                  "data-timeline-group-footer": viewRow.section?.id,
                }}
              />
            );
          }
          const item = viewRow.item;
          return (
            <DataGridTableBodyRow
              key={resource.id}
              row={table.getRow(item.id)}
              rowProps={{
                ...rowProps,
                className: "database-timeline-sidebar-row",
                "data-timeline-row-id": item.id,
                "data-database-row-id": item.id,
                "data-timeline-group-id": viewRow.sectionId,
                onMouseEnter: () => onRowMouseEnter?.(item.id),
              }}
            >
              <DatabaseActiveTableCell
                cellKey={`${item.pageId}:name`}
                rowId={item.id}
                columnId="name"
                presenceKey={`${item.id}:name`}
                className="database-page-cell"
                wrapContent={false}
              >
                {(setActive) => (
                  <DatabaseCellContent wrapContent={false}>
                    <DatabasePageLink
                      editable={editable}
                      editRequest={titleEditRequest?.rowId === item.id ? titleEditRequest : null}
                      onEditRequestHandled={onTitleEditRequestHandled}
                      onActiveChange={setActive}
                      onOpen={onOpenPage}
                      pageId={item.pageId}
                      pageSummary={item.page}
                      showPageIcon={showPageIcon}
                    />
                  </DatabaseCellContent>
                )}
              </DatabaseActiveTableCell>
            </DataGridTableBodyRow>
          );
        })}
      </DataGridTableBody>
    </TimelineTable>
  );
});
