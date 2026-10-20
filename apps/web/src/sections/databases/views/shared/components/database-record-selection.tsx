import type { ReactNode } from "react";
import type { useDatabaseRecordSelection } from "../hooks/selection";
import { DatabaseRowActionsProvider } from "./database-row-actions";
import { DatabaseSelectionToolbar } from "./database-selection-toolbar";

export function DatabaseRecordSelection({
  selection,
  children,
}: {
  selection: ReturnType<typeof useDatabaseRecordSelection>["selection"];
  children: ReactNode;
}) {
  return (
    <DatabaseRowActionsProvider selection={selection}>
      {selection.selectedRows.length > 0 ? (
        <DatabaseSelectionToolbar
          clearSelection={() => selection.setSelectedRowIds(new Set())}
          selectedCount={selection.selectedRows.length}
        />
      ) : null}
      {children}
    </DatabaseRowActionsProvider>
  );
}
