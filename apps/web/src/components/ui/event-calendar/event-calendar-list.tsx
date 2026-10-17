import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
/** Keep the focused overflow event mounted while scrolling. */
export function EventCalendarList<T extends { key: string }>({
  rows,
  renderRow,
  className,
}: {
  rows: T[];
  renderRow: (row: T) => ReactNode;
  className?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewport.current,
    estimateSize: () => 40,
    overscan: 5,
    getItemKey: (index) => rows[index]!.key,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      return focused !== null && focused < rows.length && !indexes.includes(focused)
        ? [...indexes, focused].sort((a, b) => a - b)
        : indexes;
    },
  });
  const mounted = virtual.getVirtualItems();
  useLayoutEffect(() => {
    if (pending === null) return;
    const target = viewport.current?.querySelector<HTMLButtonElement>(
      `[data-index="${pending}"] button`,
    );
    if (target) {
      target.focus({ preventScroll: true });
      setPending(null);
    }
  }, [pending, mounted]);
  return (
    <div
      data-calendar-scroll
      data-calendar-virtual-list
      ref={viewport}
      className={cn("h-80 overflow-y-auto overscroll-y-none", className)}
      onFocusCapture={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
        if (row) setFocused(Number(row.dataset.index));
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null);
      }}
      onKeyDown={(event) => {
        const index = overflowNeighborIndex(event, rows);
        if (index === null) return;
        event.preventDefault();
        setFocused(index);
        setPending(index);
        virtual.scrollToIndex(index, { align: "auto" });
      }}
    >
      <div className="relative w-full" style={{ height: virtual.getTotalSize() }}>
        {mounted.map((entry) => {
          const row = rows[entry.index]!;
          return (
            <div
              key={entry.key}
              ref={virtual.measureElement}
              data-index={entry.index}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${entry.start}px)` }}
            >
              {renderRow(row)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function overflowDirection(event: { key: string; shiftKey: boolean }) {
  if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) return -1;
  return 1;
}
function overflowNeighborIndex(
  event: { key: string; shiftKey: boolean; target: EventTarget | null },
  rows: { key: string }[],
) {
  if (event.key !== "Tab" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return null;
  if (!(event.target instanceof HTMLElement) || !event.target.closest('button,[role="button"]'))
    return null;
  const row = event.target.closest<HTMLElement>("[data-index]");
  if (!row) return null;
  return nextOverflowIndex(Number(row.dataset.index), overflowDirection(event), rows);
}
function nextOverflowIndex(start: number, direction: number, rows: { key: string }[]) {
  let index = start + direction;
  while (index >= 0 && index < rows.length && !rows[index]) index += direction;
  if (index < 0 || index >= rows.length) return null;
  return index;
}
