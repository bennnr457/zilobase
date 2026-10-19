import { useQueries } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { resolvePageDetailReference } from "../../pages/cache";
import { pageQueryOptions } from "../../pages/queries";
import { useZilobaseFeatures } from "../../shared/context";
import type { SortableDatabaseItem } from "../interactions/item-utils";
import {
  runDatabaseRecordActions,
  type DatabaseRowAction,
  type DatabaseRowActionResult,
} from "./row-action-operations";
export {
  orderDatabaseRowActions,
  type DatabaseRowAction,
  type DatabaseRowActionResult,
} from "./row-action-operations";

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
  const context = useZilobaseFeatures();
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
  const run = async (rows: SortableDatabaseItem[], action: DatabaseRowAction) => {
    if (running.current || !editable || !rows.length)
      return {
        succeeded: [],
        failed: [],
        created: [],
        expired: false,
      } satisfies DatabaseRowActionResult;
    running.current = true;
    setPending(true);
    try {
      return await runDatabaseRecordActions(
        {
          ...context,
          isCurrent: () =>
            mounted.current && current.current.scope === scope && current.current.editable,
        },
        { databaseId, hostDatabaseId, workspaceId, rows, action },
      );
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return { pending, run };
}
