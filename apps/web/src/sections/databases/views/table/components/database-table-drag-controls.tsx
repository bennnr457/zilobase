import { type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { cn } from "@/lib/utils";

export function DatabaseHeaderReorderItem({
  children,
  canReorder,
  className,
  headerScope,
  isDragging,
  columnId,
  onDragEnd,
  onDragStart,
}: {
  canReorder: boolean;
  children: (onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void) => ReactNode;
  className?: string;
  headerScope: string;
  isDragging: boolean;
  columnId: string;
  onDragEnd: () => void;
  onDragStart: () => void;
}) {
  const dragControls = useDragControls();
  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!canReorder) return;

    event.stopPropagation();
    dragControls.start(event);
  };

  return (
    <Reorder.Item
      as="th"
      className={cn("database-reorderable-header", className)}
      data-column-dragging={isDragging ? "true" : undefined}
      data-column-reorderable={canReorder ? "true" : undefined}
      data-header-scope={headerScope}
      data-property-id={columnId}
      dragControls={dragControls}
      dragListener={false}
      transition={{ layout: { duration: 0.18, ease: "easeOut" } }}
      value={columnId}
      whileDrag={{ scale: 0.995 }}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
    >
      {children(startDrag)}
    </Reorder.Item>
  );
}
