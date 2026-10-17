import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTable, type ColumnDef, type CellSelectionState } from "@tanstack/react-table";
import { useZilobaseFeatures } from "@zilobase/features";
import { useSharedDataRevision } from "@zilobase/features/data/react";
import { readCachedPage } from "@zilobase/features/pages";
import { sharedClient } from "@zilobase/features/data";
import {
  areSerializedPropertyValuesEqual,
  createDatabaseSpreadsheetHistoryAction,
  formatDatabaseSpreadsheetValue,
  getDatabasePropertyCellKind,
  isDatabaseSpreadsheetWritable,
  parseDatabaseSpreadsheetValue,
  type DatabasePropertyListItem,
  type DatabasePropertyValue,
  type DatabaseSpreadsheetChange,
} from "@zilobase/features/databases";
import { useChangeDatabaseRow } from "@zilobase/features/databases/react";
import { toast } from "sonner";
import { useUndoHistory } from "@/app/shortcuts/undo-history";
import {
  dataGridFeatures,
  type DataGridFeatures,
  type DataGridCellSelectionSnapshot,
  type DataGridCellsChangeDetails,
} from "@/components/ui/data-grid/data-grid";
import type { DatabaseViewProviderValue } from "../../state/components/database-view-context";
import { getColumnWidth, type TableRow } from "../lib/database-table-model";

export type DatabaseGridRow = TableRow & { cellValues: Record<string, DatabasePropertyValue> };
const unobservedSelection: CellSelectionState = [];
export const DatabaseGridScrollContext = createContext<{
  focusedRowId: string | null;
  registerRows: (ids: string[], scroll: (rowId: string) => void) => () => void;
} | null>(null);
export const useDatabaseGridScroll = () => useContext(DatabaseGridScrollContext);

export function useDatabaseGrid({
  rows,
  allRows,
  columnKeys,
  columnWidths,
  properties,
  values,
  people,
  editable,
  nameLabel,
  databaseId,
  hostDatabaseId,
  scope,
  savePropertyValue,
}: {
  rows: TableRow[];
  allRows: TableRow[];
  columnKeys: string[];
  columnWidths: Record<string, number>;
  properties: DatabasePropertyListItem[];
  values: Record<string, DatabasePropertyValue>;
  people: Array<{ id: string; name: string }>;
  editable: boolean;
  nameLabel: string;
  databaseId: string;
  hostDatabaseId: string | null | undefined;
  scope: string;
  savePropertyValue: DatabaseViewProviderValue["savePropertyValue"];
}) {
  const { queryClient } = useZilobaseFeatures();
  const revision = useSharedDataRevision(queryClient);
  const sharedOwner = sharedClient(queryClient);
  const authorization = sharedOwner.capture();
  const controllerScope = `${scope}:${authorization.key}:${authorization.epoch}`;
  const titleValue = useCallback(
    (row: TableRow) => readCachedPage(queryClient, row.pageId)?.name ?? row.page.name ?? "",
    [queryClient],
  );
  const changeRow = useChangeDatabaseRow();
  const undo = useUndoHistory();
  const sourceRowsById = useMemo(() => new Map(allRows.map((row) => [row.id, row])), [allRows]);
  const byId = useMemo(
    () => new Map(properties.map((property) => [property.id, property])),
    [properties],
  );
  const bySchemaId = useMemo(
    () => new Map(properties.map((property) => [property.property.id, property])),
    [properties],
  );
  const current = useRef({ sourceRowsById, byId, bySchemaId, values, people, editable, scope });
  current.current = { sourceRowsById, byId, bySchemaId, values, people, editable, scope };
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const data = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        cellValues: Object.fromEntries(
          columnKeys.map((id) => [
            id,
            id === "name"
              ? titleValue(row)
              : (values[`${row.pageId}:${byId.get(id)?.property.id}`] ?? ""),
          ]),
        ),
      })),
    [rows, values, columnKeys, byId, titleValue, revision],
  );
  const columns = useMemo<ColumnDef<DataGridFeatures, DatabaseGridRow>[]>(
    () =>
      columnKeys.map((id) => {
        const property = byId.get(id);
        const title = id === "name";
        const writable =
          editable &&
          (title || Boolean(property && isDatabaseSpreadsheetWritable(property.property.type)));
        const text =
          title || (property && getDatabasePropertyCellKind(property.property.type) === "input");
        return {
          id,
          accessorFn: (row) => row.cellValues[id] ?? "",
          size: getColumnWidth(columnWidths, id),
          enableCellSelection: title || Boolean(property),
          meta: {
            headerTitle: title ? nameLabel : (property?.property.name ?? ""),
            cellEdit: {
              editable: writable,
              clearValue: "",
              format: (value) => formatDatabaseSpreadsheetValue(value as DatabasePropertyValue),
              parse: (raw) =>
                title
                  ? raw
                  : property
                    ? parseDatabaseSpreadsheetValue(property, raw, people)
                    : undefined,
              control:
                writable && text
                  ? property?.property.type === "number"
                    ? "text"
                    : "textarea"
                  : undefined,
            },
          },
        };
      }),
    [columnKeys, columnWidths, byId, editable, nameLabel, people],
  );
  const table = useTable(
    {
      features: dataGridFeatures,
      columns,
      data,
      getRowId: (row: DatabaseGridRow) => row.id,
      manualSorting: true,
      manualFiltering: true,
      manualPagination: true,
      autoResetPageIndex: false,
      autoResetCellSelection: false,
      enableRowSelection: false,
    },
    (state) => ({ ...state, cellSelection: unobservedSelection }),
  );
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const onCellSelectionChange = useCallback((snapshot: DataGridCellSelectionSnapshot) => {
    setFocusedRowId(snapshot.focused?.rowId ?? null);
  }, []);
  const selectionShape = `${controllerScope}:${rows.map((row) => row.id).join("|")}:${columnKeys.join("|")}`;
  const previousShape = useRef(selectionShape);
  useEffect(() => {
    if (previousShape.current === selectionShape) return;
    previousShape.current = selectionShape;
    table.resetCellSelection(true);
    setFocusedRowId(null);
  }, [selectionShape, table]);
  const scrollHandlers = useRef(new Map<string, (id: string) => void>());
  const registerRows = useCallback((ids: string[], scroll: (id: string) => void) => {
    ids.forEach((id) => scrollHandlers.current.set(id, scroll));
    return () =>
      ids.forEach((id) => {
        if (scrollHandlers.current.get(id) === scroll) scrollHandlers.current.delete(id);
      });
  }, []);
  const onScrollToCell = useCallback((id: string) => scrollHandlers.current.get(id)?.(id), []);

  const onCellsChange = useCallback(
    (details: DataGridCellsChangeDetails<DatabaseGridRow>) => {
      if (
        !mounted.current ||
        !current.current.editable ||
        current.current.scope !== scope ||
        !sharedOwner.isCurrent(authorization)
      )
        return;
      const owner = sharedOwner,
        capture = authorization;
      const isCurrent = () =>
        mounted.current &&
        current.current.scope === scope &&
        current.current.editable &&
        owner.isCurrent(capture);
      const rowsById = current.current.sourceRowsById;
      const changes: DatabaseSpreadsheetChange[] = [];
      let rejected = details.rejected.length;
      for (const proposal of details.changes) {
        const row = rowsById.get(proposal.rowId);
        const property = current.current.byId.get(proposal.columnId);
        const value = proposal.value;
        if (
          !row ||
          (typeof value !== "string" &&
            !(Array.isArray(value) && value.every((item) => typeof item === "string")))
        ) {
          rejected++;
          continue;
        }
        if (proposal.columnId === "name") {
          const previousValue = titleValue(row);
          if (typeof value !== "string" || previousValue !== proposal.previousValue) {
            rejected++;
            continue;
          }
          if (previousValue !== value)
            changes.push({
              kind: "title",
              rowId: row.id,
              pageId: row.pageId,
              previousValue,
              nextValue: value,
            });
        } else if (property && isDatabaseSpreadsheetWritable(property.property.type)) {
          const p = property.property,
            previousValue = current.current.values[`${row.pageId}:${p.id}`] ?? "";
          const validated = parseDatabaseSpreadsheetValue(
            property,
            formatDatabaseSpreadsheetValue(value),
            current.current.people,
          );
          if (
            validated === undefined ||
            !areSerializedPropertyValuesEqual(p.type, value, validated)
          ) {
            rejected++;
            continue;
          }
          if (
            !areSerializedPropertyValuesEqual(
              p.type,
              previousValue,
              proposal.previousValue as DatabasePropertyValue,
            )
          ) {
            rejected++;
            continue;
          }
          if (!areSerializedPropertyValuesEqual(p.type, previousValue, value))
            changes.push({
              kind: "property",
              rowId: row.id,
              pageId: row.pageId,
              propertyId: p.id,
              propertyType: p.type,
              previousValue: Array.isArray(previousValue) ? [...previousValue] : previousValue,
              nextValue: Array.isArray(value) ? [...value] : value,
            });
        } else rejected++;
      }
      const canWrite = (change: DatabaseSpreadsheetChange, value: DatabasePropertyValue) => {
        if (change.kind === "title") return true;
        const property = current.current.bySchemaId.get(change.propertyId);
        if (
          !property ||
          property.property.type !== change.propertyType ||
          !isDatabaseSpreadsheetWritable(change.propertyType)
        )
          return false;
        const validated = parseDatabaseSpreadsheetValue(
          property,
          formatDatabaseSpreadsheetValue(value),
          current.current.people,
        );
        return (
          validated !== undefined &&
          areSerializedPropertyValuesEqual(change.propertyType, value, validated)
        );
      };
      const save = (change: DatabaseSpreadsheetChange, value: DatabasePropertyValue) => {
        if (!isCurrent() || !canWrite(change, value)) return;
        if (change.kind === "title")
          changeRow.mutate(
            {
              databaseId: hostDatabaseId ?? databaseId,
              dataSourceId: databaseId,
              rowId: change.rowId,
              title: String(value),
            },
            {
              onError: () => {
                if (isCurrent()) toast.error("Couldn't update page title");
              },
            },
          );
        else
          savePropertyValue(
            change.rowId,
            change.propertyId,
            change.propertyType,
            current.current.values[`${change.pageId}:${change.propertyId}`] ?? "",
            value,
          );
      };
      undo.runWithoutRecording(() => changes.forEach((change) => save(change, change.nextValue)));
      if (changes.length)
        undo.pushAction(
          createDatabaseSpreadsheetHistoryAction({
            label: `${details.source === "edit" ? "Edit" : details.source === "fill" ? "Fill" : details.source === "paste" ? "Paste" : details.source === "cut" ? "Cut" : "Clear"} database cells`,
            changes,
            save,
            runWithoutRecording: undo.runWithoutRecording,
            readValue: (change) => {
              if (
                !isCurrent() ||
                !canWrite(change, change.previousValue) ||
                !canWrite(change, change.nextValue)
              )
                return undefined;
              const row = current.current.sourceRowsById.get(change.rowId);
              return !row
                ? undefined
                : change.kind === "title"
                  ? titleValue(row)
                  : (current.current.values[`${row.pageId}:${change.propertyId}`] ?? "");
            },
          }),
        );
      if (rejected)
        toast.info(
          `${rejected} ${rejected === 1 ? "cell was" : "cells were"} skipped because the value is invalid, read-only, or has changed.`,
        );
    },
    [
      scope,
      sharedOwner,
      authorization.key,
      authorization.epoch,
      queryClient,
      byId,
      undo,
      changeRow,
      titleValue,
      databaseId,
      hostDatabaseId,
      savePropertyValue,
    ],
  );
  const scrollContext = useMemo(
    () => ({ focusedRowId, registerRows }),
    [focusedRowId, registerRows],
  );
  return {
    table,
    onCellsChange,
    onCellSelectionChange,
    onScrollToCell,
    scrollContext,
    controllerScope,
  };
}
