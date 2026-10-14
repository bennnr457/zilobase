import { useSharedDataRevision } from "../data/react";
import { resolveCalendarCatalog } from "./store";
import { useQueries } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { calendarCatalogQueryOptions } from "./queries";
import type { CalendarConnection } from "./contracts";
export function useCalendarCatalog(connections: CalendarConnection[]) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  useSharedDataRevision(queryClient);
  const references = useQueries({
    queries: connections.map((connection) => calendarCatalogQueryOptions(apiFetch, connection)),
  });
  const queries = references.map((query) => ({
    ...query,
    data: resolveCalendarCatalog(queryClient, query.data),
  }));
  return {
    queries,
    calendars: queries.flatMap((query) => query.data?.calendars ?? []),
    ready: queries.every((query) => query.isSuccess),
  };
}
