import {
  Fragment,
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import { getColorToken } from "@/lib/color-tokens";
import { getDatabaseHorizontalScrollSync } from "../../../interactions/lib/database-wheel-scroll";
import {
  isVerticalScrollContainer,
  shouldRenderVirtualizedDatabaseRows,
} from "../../controller/lib/database-view-scroll";
import { useActiveDatabaseCellKey } from "../../state/components/database-cell-state";
import { ADD_PROPERTY_COLUMN_ID, type TableRow } from "../lib/database-table-model";
import { DataGridTableBase, DataGridTableBody } from "@/components/ui/data-grid/data-grid-table";
import { useDatabaseGridScroll } from "../hooks/use-database-grid";

export function getConditionalColorClassName(color?: string) {
  return color ? getColorToken(color).backgroundClass : undefined;
}

export function getTableMinWidthStyle(tableMinWidth: number) {
  return {
    "--database-table-min-width": `${tableMinWidth}px`,
  } as CSSProperties;
}

export function DatabaseTable({
  children,
  columnKeys,
  tableMinWidth,
}: {
  children: ReactNode;
  columnKeys: string[];
  columnWidths: Record<string, number>;
  tableMinWidth: number;
}) {
  return (
    <DataGridTableBase
      tableProps={{
        className: "database-table border-collapse",
        role: "presentation",
        style: {
          ...getTableMinWidthStyle(tableMinWidth),
          width: columnKeys.includes(ADD_PROPERTY_COLUMN_ID) ? "100%" : tableMinWidth,
          minWidth: tableMinWidth,
          borderCollapse: "collapse",
        },
      }}
    >
      {children}
    </DataGridTableBase>
  );
}

export function DatabaseVirtualizedTable({
  columnKeys,
  columnWidths,
  footerRow,
  header,
  measurementKey,
  onRowsRendered,
  renderRow,
  rows,
  tableMinWidth,
  virtualizationEnabled,
}: {
  columnKeys: string[];
  columnWidths: Record<string, number>;
  footerRow?: ReactNode;
  header?: ReactNode;
  measurementKey: string;
  onRowsRendered?: () => void;
  renderRow: (
    row: TableRow,
    index: number,
    measureElement: (node: Element | null) => void,
  ) => ReactNode;
  rows: TableRow[];
  tableMinWidth: number;
  virtualizationEnabled: boolean;
}) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const grid = useDatabaseGridScroll();
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const getItemKey = useCallback((index: number) => rows[index]?.id ?? index, [rows]);
  const activeCellKey = useActiveDatabaseCellKey();
  const rowIndexByPageId = useMemo(
    () => new Map(rows.map((row, index) => [row.pageId, index])),
    [rows],
  );
  const activePageId = activeCellPageId(activeCellKey);
  const activeRowIndex = activePageId ? (rowIndexByPageId.get(activePageId) ?? -1) : -1;
  const focusedRowIndex = grid?.focusedRowId
    ? rows.findIndex((row) => row.id === grid.focusedRowId)
    : -1;
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);

      return [
        ...new Set([
          ...indexes,
          ...[activeRowIndex, focusedRowIndex].filter((index) => index >= 0),
        ]),
      ].sort((left, right) => left - right);
    },
    [activeRowIndex, focusedRowIndex],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    // Do not cache a zero offset before discovering the page's scroll owner.
    // Empty and nonvirtualized tables must not attach to it at all.
    enabled: virtualizationEnabled && scrollElement !== null && rows.length > 0,
    estimateSize: () => 32,
    getScrollElement: () => scrollElement,
    getItemKey,
    initialOffset: () => scrollElement?.scrollTop ?? 0,
    overscan: 8,
    rangeExtractor,
    scrollMargin,
  });

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [measurementKey, virtualizer]);

  useLayoutEffect(
    () =>
      grid?.registerRows(
        rows.map((row) => row.id),
        (id) => {
          const index = rows.findIndex((row) => row.id === id);
          if (index < 0) return;
          if (virtualizationEnabled && scrollElement)
            virtualizer.scrollToIndex(index, { align: "auto" });
          else
            tableRef.current
              ?.querySelector(`[data-database-row-id="${CSS.escape(id)}"]`)
              ?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
        },
      ),
    [grid?.registerRows, rows, scrollElement, virtualizationEnabled, virtualizer],
  );

  useLayoutEffect(() => {
    const element = tableRef.current;

    if (!element) {
      return;
    }

    let parent = element.parentElement;
    let nextScrollElement: HTMLElement | null = null;

    while (parent) {
      const overflowY = window.getComputedStyle(parent).overflowY;

      if (
        isVerticalScrollContainer({
          clientHeight: parent.clientHeight,
          overflowY,
          scrollHeight: parent.scrollHeight,
        })
      ) {
        nextScrollElement = parent;
        break;
      }

      parent = parent.parentElement;
    }

    nextScrollElement ??= document.scrollingElement as HTMLElement | null;
    setScrollElement(nextScrollElement);

    const measureOffset = () => {
      const elementRect = element.getBoundingClientRect();
      const scrollRect = nextScrollElement?.getBoundingClientRect();
      const scrollTop = nextScrollElement?.scrollTop ?? window.scrollY;

      const nextScrollMargin = elementRect.top - (scrollRect?.top ?? 0) + scrollTop;
      setScrollMargin((current) => (current === nextScrollMargin ? current : nextScrollMargin));
    };

    measureOffset();
    const observer = new ResizeObserver(measureOffset);
    observer.observe(element);
    if (nextScrollElement) {
      observer.observe(nextScrollElement);
    }
    window.addEventListener("resize", measureOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureOffset);
    };
  }, []);

  const virtualRows = virtualizer.getVirtualItems();
  const renderVirtualRows = shouldRenderVirtualizedDatabaseRows({
    hasScrollElement: scrollElement !== null,
    virtualRowCount: virtualRows.length,
    virtualizationEnabled,
  });
  const renderedVirtualRowKey = virtualRows.map((virtualRow) => virtualRow.key).join("|");

  useLayoutEffect(() => {
    if (renderVirtualRows) onRowsRendered?.();
  }, [onRowsRendered, renderVirtualRows, renderedVirtualRowKey]);

  const getLocalVirtualStart = (start: number) => start - scrollMargin;
  const getLocalVirtualEnd = (end: number) => end - scrollMargin;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - getLocalVirtualEnd(virtualRows[virtualRows.length - 1].end)
      : 0;

  return (
    <div ref={tableRef}>
      <DatabaseTable
        columnKeys={columnKeys}
        columnWidths={columnWidths}
        tableMinWidth={tableMinWidth}
      >
        {header}
        <DataGridTableBody>
          {renderVirtualRows
            ? virtualRows.map((virtualRow, virtualIndex) => {
                const previousEnd =
                  virtualIndex === 0 ? 0 : getLocalVirtualEnd(virtualRows[virtualIndex - 1].end);
                const gap = getLocalVirtualStart(virtualRow.start) - previousEnd;

                return (
                  <Fragment key={virtualRow.key}>
                    {gap > 0 ? (
                      <tr aria-hidden="true">
                        <td
                          className="database-virtual-spacer"
                          colSpan={columnKeys.length}
                          style={{ height: gap }}
                        />
                      </tr>
                    ) : null}
                    <DatabaseVirtualizedRow
                      row={rows[virtualRow.index]}
                      index={virtualRow.index}
                      measureElement={virtualizer.measureElement}
                      renderRow={renderRow}
                    />
                  </Fragment>
                );
              })
            : rows.map((row, index) => renderRow(row, index, virtualizer.measureElement))}
          {renderVirtualRows && paddingBottom > 0 ? (
            <tr aria-hidden="true">
              <td
                className="database-virtual-spacer"
                colSpan={columnKeys.length}
                style={{ height: paddingBottom }}
              />
            </tr>
          ) : null}
          {footerRow}
        </DataGridTableBody>
      </DatabaseTable>
    </div>
  );
}

// Scroll updates belong to the shell. Retained rows only need rendering when
// their data/index or the parent's rendering inputs change.
const DatabaseVirtualizedRow = memo(function DatabaseVirtualizedRow({
  row,
  index,
  measureElement,
  renderRow,
}: {
  row: TableRow;
  index: number;
  measureElement: (node: Element | null) => void;
  renderRow: (
    row: TableRow,
    index: number,
    measureElement: (node: Element | null) => void,
  ) => ReactNode;
}) {
  return renderRow(row, index, measureElement);
});

export function useSyncedHorizontalScroll(
  headerRef: RefObject<HTMLElement | null>,
  bodyRef: RefObject<HTMLElement | null>,
  syncVersion: unknown,
) {
  useLayoutEffect(() => {
    const header = headerRef.current;
    const body = bodyRef.current;

    if (!header || !body) {
      return;
    }

    const syncScroll = (source: HTMLElement, target: HTMLElement) => {
      const syncState = getDatabaseHorizontalScrollSync(source, target.scrollLeft);

      source.style.removeProperty("--database-horizontal-rubber-band-offset");
      delete source.dataset.databaseRubberBand;

      if (syncState.isRubberBanding) {
        target.style.setProperty(
          "--database-horizontal-rubber-band-offset",
          `${syncState.rubberBandOffset}px`,
        );
        target.dataset.databaseRubberBand = "true";
        return;
      }

      target.style.removeProperty("--database-horizontal-rubber-band-offset");
      delete target.dataset.databaseRubberBand;

      if (target.scrollLeft !== syncState.scrollLeft) {
        target.scrollLeft = syncState.scrollLeft;
      }
    };
    const syncHeaderToBody = () => syncScroll(body, header);
    const syncBodyToHeader = () => syncScroll(header, body);

    syncHeaderToBody();
    body.addEventListener("scroll", syncHeaderToBody, { passive: true });
    header.addEventListener("scroll", syncBodyToHeader, { passive: true });

    return () => {
      body.removeEventListener("scroll", syncHeaderToBody);
      header.removeEventListener("scroll", syncBodyToHeader);
      body.style.removeProperty("--database-horizontal-rubber-band-offset");
      header.style.removeProperty("--database-horizontal-rubber-band-offset");
      delete body.dataset.databaseRubberBand;
      delete header.dataset.databaseRubberBand;
    };
  }, [bodyRef, headerRef, syncVersion]);
}

function activeCellPageId(activeCellKey: string | null) {
  const activeCellSeparatorIndex = activeCellKey?.indexOf(":") ?? -1;
  return activeCellKey && activeCellSeparatorIndex > -1
    ? activeCellKey.slice(0, activeCellSeparatorIndex)
    : null;
}
