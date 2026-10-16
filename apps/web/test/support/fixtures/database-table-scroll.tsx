import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { DatabaseVirtualizedTable } from "../../../src/sections/databases/views/table/components/database-table-shell";
import {
  DatabaseCellStateProvider,
  useSetActiveDatabaseCell,
} from "../../../src/sections/databases/views/state/components/database-cell-state";
import type { TableRow } from "../../../src/sections/databases/views/table/lib/database-table-model";

export function mountScrollTable(
  container: HTMLElement,
  count: number,
  options: { virtualizationEnabled?: boolean } = {},
) {
  let virtualizationEnabled = options.virtualizationEnabled ?? true;
  const renders = new Map<number, number>();
  let keyReads = 0;
  let renderedRangeNotifications = 0;
  const createRows = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      get id() {
        keyReads++;
        return `row-${index}`;
      },
      pageId: `page-${index}`,
    })) as TableRow[];
  let rows = createRows(count);
  let setActive: (key: string | null) => void;
  function ActiveCellController() {
    setActive = useSetActiveDatabaseCell();
    return null;
  }
  const root = createRoot(container);
  function render(label: string) {
    flushSync(() =>
      root.render(
        createElement(
          DatabaseCellStateProvider,
          null,
          createElement(ActiveCellController),
          createElement(DatabaseVirtualizedTable, {
            columnKeys: ["name"],
            columnWidths: { name: 250 },
            measurementKey: "test",
            tableMinWidth: 250,
            virtualizationEnabled,
            onRowsRendered: () => {
              renderedRangeNotifications += 1;
            },
            rows,
            renderRow: (row, index, measureElement) => {
              renders.set(index, (renders.get(index) ?? 0) + 1);
              return createElement(
                "tr",
                // Match the estimate so scroll tests exclude variable-height anchoring.
                { key: row.id, "data-index": index, ref: measureElement, style: { height: 32 } },
                createElement("td", null, `${label} ${row.pageId}`),
              );
            },
          }),
        ),
      ),
    );
  }
  render("Row");
  return {
    renders,
    reset: () => {
      renders.clear();
      keyReads = 0;
    },
    getKeyReads: () => keyReads,
    getRenderedRangeNotifications: () => renderedRangeNotifications,
    update: () => render("Updated"),
    setRowCount: (count: number) => {
      rows = createRows(count);
      render("Row");
    },
    setVirtualizationEnabled: (enabled: boolean) => {
      virtualizationEnabled = enabled;
      render("Row");
    },
    reverse: () => {
      rows = [...rows].reverse();
      render("Reversed");
    },
    activate: (key: string | null) => flushSync(() => setActive(key)),
    unmount: () => flushSync(() => root.unmount()),
  };
}
