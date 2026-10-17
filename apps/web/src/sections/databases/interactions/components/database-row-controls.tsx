import type { CSSProperties, DragEvent as ReactDragEvent } from "react";
import type { SortableDatabaseItem } from "@zilobase/features/databases";
import { GripVertical } from "@/components/icons";
import { Checkbox } from "@/components/ui/checkbox";
import type { DatabaseRowLayout } from "../lib/database-table-layout";

export function DatabaseRowDragControls({
  canReorderRows,
  draggedRowId,
  editable,
  hoveredRowId,
  onDragEnd,
  onDragStart,
  onHoveredRowChange,
  onSelectedRowChange,
  rowDragTitle,
  rowLayout,
  rowsById,
  selectedRowIds,
}: {
  canReorderRows: boolean;
  draggedRowId: string | null;
  editable: boolean;
  hoveredRowId: string | null;
  onDragEnd: () => void;
  onDragStart: (row: SortableDatabaseItem, event: ReactDragEvent<HTMLButtonElement>) => void;
  onHoveredRowChange: (rowId: string | null) => void;
  onSelectedRowChange: (rowId: string, selected: boolean) => void;
  rowDragTitle: string;
  rowLayout: DatabaseRowLayout;
  rowsById: ReadonlyMap<string, SortableDatabaseItem>;
  selectedRowIds: Set<string>;
}) {
  if (!editable) return null;

  return (
    <div className="database-row-drag-rail">
      {rowLayout.rowIds.map((rowId) => {
        const row = rowsById.get(rowId);
        if (!row) return null;

        const rowCenter = rowLayout.centers[row.id];
        if (rowCenter === undefined) return null;

        const isRowHandleVisible =
          hoveredRowId === row.id || draggedRowId === row.id || selectedRowIds.has(row.id);

        return (
          <div
            className="database-row-controls"
            data-visible={isRowHandleVisible ? "true" : undefined}
            key={row.id}
            onMouseEnter={() => onHoveredRowChange(row.id)}
            onMouseLeave={() => {
              if (!draggedRowId) onHoveredRowChange(null);
            }}
            style={
              {
                "--database-row-hit-height": `${rowLayout.heights[row.id] ?? 28}px`,
                top: rowCenter,
              } as CSSProperties
            }
          >
            <button
              aria-label={`Drag ${row.page.name.trim() || "Untitled"}`}
              className="database-row-drag-handle"
              data-database-row-drag-handle
              data-dragging={draggedRowId === row.id ? "true" : undefined}
              disabled={!canReorderRows}
              draggable={canReorderRows}
              onClick={(event) => event.preventDefault()}
              onDragEnd={onDragEnd}
              onDragStart={(event) => onDragStart(row, event)}
              title={rowDragTitle}
              type="button"
            >
              <GripVertical />
            </button>
            <Checkbox
              aria-label={`Select ${row.page.name.trim() || "Untitled"}`}
              checked={selectedRowIds.has(row.id)}
              className="database-row-checkbox"
              onCheckedChange={(checked) => onSelectedRowChange(row.id, checked === true)}
            />
          </div>
        );
      })}
    </div>
  );
}

export function DatabaseRowDropLine({ depth, top }: { depth: number; top: number | null }) {
  if (top === null) return null;

  return (
    <div
      aria-hidden="true"
      className="drag-drop-line database-row-drop-line"
      data-orientation="horizontal"
      style={
        {
          "--database-row-drop-depth": depth,
          top,
        } as CSSProperties
      }
    />
  );
}
