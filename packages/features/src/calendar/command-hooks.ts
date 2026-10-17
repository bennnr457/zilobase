import { useCallback, useEffect, useRef } from "react";
import { useZilobaseFeatures } from "../shared/context";
import { sharedClient } from "../data/client";
import { runCalendarMutation, reconcileCalendarMutations } from "./commands";
import type { CalendarCacheStore } from "./storage";

/** Capture runtime and mounted source before each write; late results cannot update the next view. */
export function useCalendarEventCommands(database: CalendarCacheStore | null, scope?: string) {
  const { queryClient, apiFetch } = useZilobaseFeatures();
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
      return runCalendarMutation(
        {
          ...input,
          database: store,
          isCurrent: () => token !== null && token === lifetime.current && owner.isCurrent(capture),
        },
        apiFetch,
      );
    },
    [database, queryClient, apiFetch],
  );
  const reconcile = useCallback(async () => {
    if (!database) return;
    const owner = sharedClient(queryClient),
      capture = owner.capture(),
      token = lifetime.current;
    await reconcileCalendarMutations(
      database,
      apiFetch,
      () => token !== null && token === lifetime.current && owner.isCurrent(capture),
    );
  }, [database, queryClient, apiFetch]);
  return { run, reconcile };
}
