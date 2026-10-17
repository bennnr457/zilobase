import {
  getSharedDatabaseSelectionValue,
  createCellEditHistoryAction,
  areSerializedPropertyValuesEqual,
  type DatabasePropertyValue as DatabasePropertyValueType,
  type DatabaseCellFillHistoryChange,
  type DatabasePropertyListItem,
} from "@zilobase/features/databases";
import { useCallback, useMemo, useState, type MutableRefObject } from "react";
import type { useUndoHistory } from "@/app/shortcuts/undo-history";
import type { SortableDatabaseItem } from "@zilobase/features/databases";
import type { DatabaseViewProviderValue } from "../../state/components/database-view-context";
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
