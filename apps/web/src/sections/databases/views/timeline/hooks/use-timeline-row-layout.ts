import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from "react";

import {
  emptyTimelineRowLayout,
  getTimelineRowDropTargetIndex,
  getTimelineGroupDropTarget,
  timelineRowLayoutsMatch,
  type TimelineRowLayout,
} from "../lib/database-timeline-layout";

const TIMELINE_ITEM_SELECTOR = ".database-timeline-sidebar-row[data-timeline-row-id]";

export function useTimelineRowLayout({
  measureKey,
  rowIds,
  timelineRef,
}: {
  measureKey: unknown;
  rowIds: string[];
  timelineRef: RefObject<HTMLDivElement | null>;
}) {
  const [layout, setLayout] = useState<TimelineRowLayout>(emptyTimelineRowLayout);
  const measureFrameRef = useRef<number | null>(null);
  const scrollTopsRef = useRef(new WeakMap<HTMLElement, number>());

  const measureRows = useCallback(() => {
    const timeline = timelineRef.current;
    if (!timeline) {
      return emptyTimelineRowLayout;
    }

    const nextLayout = measureTimelineRows(timeline);
    setLayout((current) => (timelineRowLayoutsMatch(current, nextLayout) ? current : nextLayout));
    return nextLayout;
  }, [timelineRef]);

  const scheduleMeasurement = useCallback(() => {
    if (measureFrameRef.current !== null) return;

    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = null;
      measureRows();
    });
  }, [measureRows]);

  useLayoutEffect(() => {
    measureRows();
    const timeline = timelineRef.current;
    const cancelScheduledMeasurement = () => {
      if (measureFrameRef.current === null) return;
      window.cancelAnimationFrame(measureFrameRef.current);
      measureFrameRef.current = null;
    };

    window.addEventListener("resize", scheduleMeasurement);
    window.addEventListener("scroll", scheduleMeasurement, true);

    if (!timeline || typeof ResizeObserver === "undefined") {
      return () => {
        window.removeEventListener("resize", scheduleMeasurement);
        window.removeEventListener("scroll", scheduleMeasurement, true);
        cancelScheduledMeasurement();
      };
    }

    const observer = new ResizeObserver(scheduleMeasurement);
    observer.observe(timeline);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
      window.removeEventListener("scroll", scheduleMeasurement, true);
      cancelScheduledMeasurement();
    };
  }, [measureKey, measureRows, scheduleMeasurement, timelineRef]);

  const getDropTargetIndex = useCallback(
    (clientY: number) => {
      const timeline = timelineRef.current;
      if (!timeline || rowIds.length === 0) return 0;

      return getTimelineRowDropTargetIndex(
        rowIds,
        layout.centers,
        clientY - timeline.getBoundingClientRect().top,
      );
    },
    [layout.centers, rowIds, timelineRef],
  );

  const handleScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => {
      const scrollElement = event.target as HTMLElement;
      const previousScrollTop = scrollTopsRef.current.get(scrollElement) ?? 0;

      if (previousScrollTop === scrollElement.scrollTop) return;

      scrollTopsRef.current.set(scrollElement, scrollElement.scrollTop);
      scheduleMeasurement();
    },
    [scheduleMeasurement],
  );

  const getGroupDropTarget = useCallback(
    (clientY: number) => {
      const timeline = timelineRef.current;
      if (!timeline) return null;
      const timelineTop = timeline.getBoundingClientRect().top;
      const tracks = new Map(
        [...timeline.querySelectorAll<HTMLElement>("[data-gantt-row]")].map((el) => [
          el.dataset.ganttRowId!,
          el,
        ]),
      );
      const readRect = (el: HTMLElement) => {
        // The same targets remain available in the date grid when the sidebar
        // is hidden; use the matching track rather than its hidden name cell.
        const id = el.closest<HTMLElement>('[data-slot="gantt-row-group"]')?.dataset.ganttRowId;
        return (
          el.getClientRects().length ? el : (tracks.get(id ?? "") ?? el)
        ).getBoundingClientRect();
      };
      const groupRows = new Map<string, { top: number; bottom: number }[]>();
      for (const row of timeline.querySelectorAll<HTMLElement>(
        "[data-timeline-row-id][data-timeline-group-id]",
      )) {
        const id = row.dataset.timelineGroupId!;
        const rect = readRect(row);
        const rows = groupRows.get(id) ?? [];
        rows.push({ top: rect.top - timelineTop, bottom: rect.bottom - timelineTop });
        groupRows.set(id, rows);
      }
      const footers = new Map(
        [...timeline.querySelectorAll<HTMLElement>("[data-timeline-group-footer]")].map((el) => [
          el.dataset.timelineGroupFooter!,
          readRect(el),
        ]),
      );
      const groups = [
        ...timeline.querySelectorAll<HTMLElement>("[data-timeline-group-header]"),
      ].map((el) => {
        const sectionId = el.dataset.timelineGroupHeader!;
        const header = readRect(el);
        const footer = footers.get(sectionId);
        const rows = groupRows.get(sectionId) ?? [];
        const end = rows.at(-1)?.bottom ?? header.bottom - timelineTop;
        return {
          sectionId,
          top: header.top - timelineTop,
          bottom: footer ? footer.bottom - timelineTop : end,
          footerTop: footer ? footer.top - timelineTop : end,
          rows,
        };
      });
      return getTimelineGroupDropTarget(groups, clientY - timelineTop);
    },
    [timelineRef],
  );

  return {
    getDropTargetIndex,
    getGroupDropTarget,
    handleScroll,
    layout,
    measureRows,
  };
}

function measureTimelineRows(timeline: HTMLDivElement): TimelineRowLayout {
  const timelineTop = timeline.getBoundingClientRect().top;
  const rowElements = timeline.querySelectorAll<HTMLElement>(TIMELINE_ITEM_SELECTOR);
  const centers: Record<string, number> = {};
  const heights: Record<string, number> = {};
  const rowIds: string[] = [];
  const viewport = timeline.querySelector<HTMLElement>(
    '[data-slot="gantt-tree-pane"] [data-slot="scroll-area-viewport"]',
  );
  const viewportRect = viewport?.getBoundingClientRect();
  const headerHeight =
    viewport?.querySelector<HTMLElement>('[data-slot="gantt-tree-header"]')?.getBoundingClientRect()
      .height ?? 0;
  const toolbarBottom =
    timeline.querySelector<HTMLElement>('[data-slot="gantt-nav"]')?.getBoundingClientRect()
      .bottom ?? 0;
  let visibleTop = Math.max(0, (viewportRect?.top ?? 0) + headerHeight, toolbarBottom);
  let visibleBottom = Math.min(window.innerHeight, viewportRect?.bottom ?? window.innerHeight);
  let ancestor = timeline.parentElement;
  while (ancestor && ancestor !== document.scrollingElement) {
    if (/^(auto|scroll|overlay|hidden)$/.test(getComputedStyle(ancestor).overflowY)) {
      const rect = ancestor.getBoundingClientRect();
      visibleTop = Math.max(visibleTop, rect.top);
      visibleBottom = Math.min(visibleBottom, rect.bottom);
    }
    ancestor = ancestor.parentElement;
  }
  const dropTops: number[] = [];

  rowElements.forEach((rowElement, index) => {
    const rect = rowElement.getBoundingClientRect();
    const top = rect.top - timelineTop;
    const rowId = rowElement.dataset.timelineRowId;

    if (rowId) {
      centers[rowId] = top + rect.height / 2;
      heights[rowId] = rect.height;
      // The rail is outside the clipped pane; only expose fully visible controls.
      if (rect.top >= visibleTop - 0.5 && rect.bottom <= visibleBottom + 0.5) rowIds.push(rowId);
    }
    dropTops[index] = top;
    if (index === rowElements.length - 1) {
      dropTops[index + 1] = top + rect.height;
    }
  });

  if (rowElements.length === 0) {
    const footer = timeline.querySelector<HTMLElement>("[data-database-row-drop-footer]");
    if (footer) dropTops[0] = footer.getBoundingClientRect().top - timelineTop;
  }
  return { centers, dropTops, heights, rowIds };
}
