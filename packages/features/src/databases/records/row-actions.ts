import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import { sharedClient } from "../../data/client";
import { useDatabaseController } from "../interactions/react";
import { useSetPageFavorite } from "../../pages/navigation-mutations";
import { useUpdatePage, useDeletePage } from "../../pages/content-mutations";
import { pageQueryOptions, pagesQueryKey } from "../../pages/queries";
import { resolvePageDetailReference } from "../../pages/cache";
import { useAddDatabaseRow } from "../mutations/rows";
import { DatabaseCommandUnconfirmedError } from "../mutations/execute";
import type { DatabaseRecordEntity } from "../core/entities";
import type { SortableDatabaseItem } from "../interactions/item-utils";

export type DatabaseRowAction =
  | { type: "favorite"; favorite: boolean }
  | { type: "icon"; icon: string | null }
  | { type: "duplicate" }
  | { type: "trash" }
  | { type: "movePage"; pageId: string }
  | {
      type: "moveDatabase";
      databaseId: string;
      dataSourceId: string;
      propertyMode: "match" | "duplicate";
    };

export type DatabaseRowActionResult = {
  succeeded: string[];
  failed: Array<{ rowId: string; error: Error }>;
  created: DatabaseRecordEntity[];
  expired: boolean;
};

export function useDatabaseRecordActionAccess(rows: SortableDatabaseItem[], enabled: boolean) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const queries = useQueries({
    queries: rows.map((row) => ({ ...pageQueryOptions(apiFetch, row.pageId), enabled })),
  });
  const details = queries.map((query) => resolvePageDetailReference(queryClient, query.data));
  return {
    loading: queries.some((query) => query.isPending),
    canEdit:
      rows.length > 0 &&
      details.every(
        (detail) =>
          detail &&
          (detail.accessLevel === "edit" || detail.accessLevel === "full") &&
          !detail.page.metadata?.locked,
      ),
    canTrash:
      rows.length > 0 &&
      details.every((detail) => detail?.accessLevel === "full" && !detail.page.metadata?.locked),
    allFavorite: details.length > 0 && details.every((detail) => detail?.page.isFavorite),
    error: queries.find((query) => query.error)?.error,
  };
}

/** Parents precede selected children; independent rows retain displayed selection order. */
export function orderDatabaseRowActions<T extends { id: string; parentRowId?: string | null }>(
  rows: T[],
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered: T[] = [];
  const visited = new Set<string>();
  const add = (row: T) => {
    if (visited.has(row.id)) return;
    visited.add(row.id);
    const parent = row.parentRowId ? byId.get(row.parentRowId) : undefined;
    if (parent) add(parent);
    ordered.push(row);
  };
  rows.forEach(add);
  return ordered;
}

export function useDatabaseRecordActions({
  databaseId,
  hostDatabaseId,
  workspaceId,
  scope,
  editable,
}: {
  databaseId: string;
  hostDatabaseId?: string | null;
  workspaceId?: string | null;
  scope: string;
  editable: boolean;
}) {
  const { queryClient, apiFetch } = useZilobaseFeatures();
  const store = useDatabaseController();
  const favorite = useSetPageFavorite();
  const update = useUpdatePage();
  const trash = useDeletePage();
  const add = useAddDatabaseRow();
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = useRef({ scope, editable });
  current.current = { scope, editable };
  const run = async (
    rows: SortableDatabaseItem[],
    action: DatabaseRowAction,
  ): Promise<DatabaseRowActionResult> => {
    const result: DatabaseRowActionResult = {
      succeeded: [],
      failed: [],
      created: [],
      expired: false,
    };
    if (running.current || !editable || !rows.length) return result;
    const cache = sharedClient(queryClient);
    const authorization = cache.capture();
    const valid = () =>
      mounted.current &&
      cache.isCurrent(authorization) &&
      current.current.scope === scope &&
      current.current.editable;
    const assertCurrent = () => {
      if (!valid()) throw new Error("Record action scope expired");
    };
    running.current = true;
    setPending(true);
    const copies = new Map<string, string>();
    try {
      // Authorize the complete selection before any mutation. These are the existing page reads.
      for (const row of rows) {
        const ref = await queryClient.fetchQuery(pageQueryOptions(apiFetch, row.pageId));
        assertCurrent();
        const detail = resolvePageDetailReference(queryClient, ref);
        if (!detail || (detail.accessLevel !== "edit" && detail.accessLevel !== "full"))
          throw new Error("Every selected record must be editable");
        if (action.type === "trash" && detail.accessLevel !== "full")
          throw new Error("Full access is required to move a page to trash");
        if (action.type !== "favorite" && detail.page.metadata?.locked)
          throw new Error("Unlock the selected pages before editing them");
      }
      for (const row of orderDatabaseRowActions(rows)) {
        if (!valid()) {
          result.expired = true;
          break;
        }
        try {
          if (action.type === "favorite")
            await favorite.mutateAsync({ pageId: row.pageId, isFavorite: action.favorite });
          else if (action.type === "icon") {
            await update.mutateAsync({ id: row.pageId, metadata: { emoji: action.icon } });
          } else if (action.type === "trash") await trash.mutateAsync(row.pageId);
          else if (action.type === "moveDatabase") {
            await add.mutateAsync({
              databaseId: action.dataSourceId,
              hostDatabaseId: action.databaseId,
              pageId: row.pageId,
              sourceHostDatabaseId: hostDatabaseId ?? databaseId,
              sourceDataSourceId: databaseId,
              sourceRowId: row.id,
              sourcePropertyMode: action.propertyMode,
            });
          } else {
            const parent =
              row.parentRowId && rows.some((item) => item.id === row.parentRowId)
                ? copies.get(row.parentRowId)
                : undefined;
            if (
              action.type === "duplicate" &&
              row.parentRowId &&
              rows.some((item) => item.id === row.parentRowId) &&
              !parent
            )
              throw new Error("The selected parent could not be duplicated");
            const ack = await store.submit(
              {
                databaseId: hostDatabaseId ?? databaseId,
                dataSourceId: databaseId,
                command:
                  action.type === "duplicate"
                    ? {
                        type: "row.duplicate",
                        rowId: row.id,
                        ...(parent ? { parentRowId: parent } : {}),
                      }
                    : { type: "row.moveToPage", rowId: row.id, pageId: action.pageId },
              },
              action.type === "movePage"
                ? [{ dataSourceId: databaseId, rowId: row.id, remove: true }]
                : [],
            );
            assertCurrent();
            if (action.type === "duplicate") {
              const created = ack.result as DatabaseRecordEntity;
              result.created.push(created);
              copies.set(row.id, created.id);
            }
          }
          assertCurrent();
          result.succeeded.push(row.id);
        } catch (cause) {
          if (!valid()) {
            result.expired = true;
            break;
          }
          const error = cause instanceof Error ? cause : new Error(String(cause));
          result.failed.push({ rowId: row.id, error });
          if (error instanceof DatabaseCommandUnconfirmedError) {
            for (const remaining of rows)
              if (
                !result.succeeded.includes(remaining.id) &&
                !result.failed.some((item) => item.rowId === remaining.id)
              )
                result.failed.push({ rowId: remaining.id, error });
            break;
          }
        }
      }
      if (valid() && workspaceId)
        await queryClient.invalidateQueries({ queryKey: pagesQueryKey(workspaceId) });
    } catch (cause) {
      result.expired = !valid();
      if (!result.expired)
        result.failed = rows.map((row) => ({
          rowId: row.id,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        }));
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
    return result;
  };
  return { pending, run };
}
