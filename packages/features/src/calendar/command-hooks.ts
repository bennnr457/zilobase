import { useCallback, useEffect, useRef } from "react";
import { sharedClient } from "../data/client";
import { useZilobaseFeatures } from "../shared/context";
import { runCalendarMutation } from "./commands";
import { executeCalendarMutation, reconcileCalendarWrites } from "./operations";
import type { CalendarCacheStore } from "./storage";

/** Capture runtime and mounted source before each write; late results cannot update the next view. */
export function useCalendarEventCommands(database: CalendarCacheStore | null, scope?: string) {
  const context = useZilobaseFeatures();
  const { queryClient, apiFetch } = context;
  const lifetime = useRef<symbol | null>(null);
  useEffect(() => {
    const token = Symbol();
    lifetime.current = token;
    return () => {
      if (lifetime.current === token) lifetime.current = null;
    };
  }, [database, scope]);
  const run = useCallback(
    async (
      input: Omit<Parameters<typeof runCalendarMutation>[0], "database" | "isCurrent"> & {
        database?: CalendarCacheStore;
      },
    ) => {
      const store = input.database ?? database;
      if (!store) throw new Error("Calendar is not available");
      const owner = sharedClient(queryClient),
        capture = owner.capture(),
        token = lifetime.current;
      return executeCalendarMutation(context, {
        ...input,
        database: store,
        isCurrent: () => token !== null && token === lifetime.current && owner.isCurrent(capture),
      });
    },
    [database, queryClient, apiFetch],
  );
  const reconcile = useCallback(async () => {
    if (!database) return;
    const owner = sharedClient(queryClient),
      capture = owner.capture(),
      token = lifetime.current;
    await reconcileCalendarWrites(context, {
      database,
      isCurrent: () => token !== null && token === lifetime.current && owner.isCurrent(capture),
    });
  }, [database, queryClient, apiFetch]);
  return { run, reconcile };
}
