import { DatabaseRowDragControls } from "../../../interactions/components/database-row-controls";
import { DefaultPageIcon } from "@/sections/pages/appearance/components/page-icon";

import type { DatabaseRow } from "@zilobase/features/databases";
import type { TimelineRowLayout } from "../lib/database-timeline-layout";
import type { TimelineRowDragController } from "./database-timeline-row-drag";

export function TimelineRowDragLayer({
  controller,
  editable,
  layout,
  sidebarCollapsed,
  selectedRowIds,
  onSelectedRowChange,
  rowsById,
}: {
  controller: TimelineRowDragController;
  editable: boolean;
  layout: TimelineRowLayout;
  sidebarCollapsed: boolean;
  selectedRowIds: Set<string>;
  onSelectedRowChange: (rowId: string, selected: boolean) => void;
  rowsById: ReadonlyMap<string, DatabaseRow>;
}) {
  return (
    <>
      {controller.overlay ? (
        <div
          aria-hidden="true"
          className="database-row-drag-overlay"
          ref={controller.overlayRef}
          style={{
            height: controller.overlay.height,
            left: controller.overlay.left,
            top: controller.overlay.top,
            width: controller.overlay.width,
            zIndex: 80,
          }}
        >
          <span className="database-row-drag-overlay-cell">
            <DefaultPageIcon
              page={controller.draggedRowId ? rowsById.get(controller.draggedRowId)?.page : null}
            />
            <span>{controller.overlay.title}</span>
          </span>
        </div>
      ) : null}

      {editable && !sidebarCollapsed ? (
        <div className="database-timeline-row-drag-rail">
          <DatabaseRowDragControls
            canReorderRows={editable}
            editable={editable}
            draggedRowId={controller.draggedRowId}
            hoveredRowId={controller.hoveredRowId}
            onDragEnd={controller.clearDrag}
            onDragStart={controller.startDrag}
            onHoveredRowChange={controller.setHoveredRowId}
            onSelectedRowChange={onSelectedRowChange}
            rowDragTitle="Drag page"
            rowsById={rowsById}
            selectedRowIds={selectedRowIds}
            rowLayout={{
              ...layout,
              heights: layout.heights ?? {},
              rowIds: layout.rowIds ?? Object.keys(layout.centers),
            }}
          />
        </div>
      ) : null}

      {controller.dropLineTop !== null ? (
        <div
          aria-hidden="true"
          className="drag-drop-line database-row-drop-line database-timeline-row-drop-line"
          data-orientation="horizontal"
          style={{ top: controller.dropLineTop, zIndex: 65 }}
        />
      ) : null}
    </>
  );
}
