import {
  getSharedDatabaseSelectionValue,
  createCellEditHistoryAction,
  areSerializedPropertyValuesEqual,
  type DatabasePropertyValue as DatabasePropertyValueType,
  type DatabaseCellFillHistoryChange,
  type DatabasePropertyListItem,
} from "@zilobase/features/databases";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useUndoHistory } from "@/app/shortcuts/undo-history";
import type { SortableDatabaseItem } from "@zilobase/features/databases";
import type { DatabaseViewProviderValue } from "../../state/components/database-view-context";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../../state/components/database-view-context";
import { useDatabaseMarquee } from "./use-database-marquee";
export { getSharedDatabaseSelectionValue } from "@zilobase/features/databases";

export function useDatabaseSelection({
  rows,
  propertyValuesByKey,
  propertyValuesByKeyRef,
  savePropertyValue,
  undoHistory,
}: {
  rows: SortableDatabaseItem[];
  propertyValuesByKey: Record<string, DatabasePropertyValueType>;
  propertyValuesByKeyRef: MutableRefObject<Record<string, DatabasePropertyValueType>>;
  savePropertyValue: DatabaseViewProviderValue["savePropertyValue"];
  undoHistory: ReturnType<typeof useUndoHistory>;
}) {
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const { databaseId, hostDatabaseId, databaseWorkspaceId, editable } = useDatabaseDataContext();
  const { activeView } = useDatabaseUiContext();
  const scope = JSON.stringify([
    databaseWorkspaceId,
    hostDatabaseId,
    databaseId,
    activeView?.id,
    editable,
  ]);
  useEffect(() => setSelectedRowIds(new Set()), [scope]);
  useEffect(() => {
    const available = new Set(rows.map((row) => row.id));
    setSelectedRowIds((current) =>
      [...current].every((id) => available.has(id))
        ? current
        : new Set([...current].filter((id) => available.has(id))),
    );
  }, [rows]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedRowIds.has(row.id)),
    [rows, selectedRowIds],
  );
  const getSelectionValue = useCallback(
    (property: DatabasePropertyListItem) => {
      const pageProperty = property.property;
      const values = selectedRows.map(
        (row) => propertyValuesByKey[`${row.pageId}:${pageProperty.id}`] ?? "",
      );

      return getSharedDatabaseSelectionValue(values, (left, right) =>
        areSerializedPropertyValuesEqual(pageProperty.type, left, right),
      );
    },
    [propertyValuesByKey, selectedRows],
  );
  const saveSelectedPropertyValue = useCallback(
    (property: DatabasePropertyListItem, nextValue: DatabasePropertyValueType) => {
      const pageProperty = property.property;
      const historyChanges: DatabaseCellFillHistoryChange[] = [];

      undoHistory.runWithoutRecording(() => {
        for (const row of selectedRows) {
          const currentValue =
            propertyValuesByKeyRef.current[`${row.pageId}:${pageProperty.id}`] ?? "";

          if (areSerializedPropertyValuesEqual(pageProperty.type, currentValue, nextValue)) {
            continue;
          }

          const savedValue = Array.isArray(nextValue) ? [...nextValue] : nextValue;

          historyChanges.push({
            nextValue: savedValue,
            pageId: row.pageId,
            previousValue: Array.isArray(currentValue) ? [...currentValue] : currentValue,
            propertyId: pageProperty.id,
            propertyType: pageProperty.type,
            rowId: row.id,
          });

          savePropertyValue(row.id, pageProperty.id, pageProperty.type, currentValue, savedValue);
        }
      });

      if (historyChanges.length === 0) {
        return;
      }

      undoHistory.pushAction(
        createCellEditHistoryAction({
          label: `Update ${pageProperty.name} for selected rows`,
          changes: historyChanges,
          readValues: () => propertyValuesByKeyRef.current,
          savePropertyValue,
          runWithoutRecording: undoHistory.runWithoutRecording,
        }),
      );
    },
    [savePropertyValue, selectedRows, undoHistory],
  );
  const toggleSelectedRow = (rowId: string, checked: boolean) => {
    setSelectedRowIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }

      return next;
    });
  };
  return {
    selectedRowIds,
    setSelectedRowIds,
    selectedRows,
    getSelectionValue,
    saveSelectedPropertyValue,
    toggleSelectedRow,
  };
}

// Card/list views share the same bulk actions as the table and timeline.
export function useDatabaseRecordSelection() {
  const { items, propertyValuesByKey, editable, databaseId, hostDatabaseId } =
    useDatabaseDataContext();
  const { activeView } = useDatabaseUiContext();
  const { savePropertyValue } = useDatabaseActionsContext();
  const undoHistory = useUndoHistory();
  const propertyValuesByKeyRef = useRef(propertyValuesByKey);
  propertyValuesByKeyRef.current = propertyValuesByKey;
  const selection = useDatabaseSelection({
    rows: items,
    propertyValuesByKey,
    propertyValuesByKeyRef,
    savePropertyValue,
    undoHistory,
  });
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  useDatabaseMarquee({
    surfaceRef,
    enabled: editable,
    scope: JSON.stringify([hostDatabaseId, databaseId, activeView?.id]),
    rowIds: items.map((row) => row.id),
    selectedRowIds: selection.selectedRowIds,
    setSelectedRowIds: selection.setSelectedRowIds,
  });
  return { selection, surfaceRef };
}
