import { useQueries } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { calendarCatalogQueryOptions } from "./queries";
import type { CalendarConnection } from "./contracts";
export function useCalendarCatalog(connections: CalendarConnection[]) {
  const { apiFetch } = useZilobaseFeatures();
  const queries = useQueries({
    queries: connections.map((connection) => calendarCatalogQueryOptions(apiFetch, connection)),
  });
  return {
    queries,
    calendars: queries.flatMap((query) => query.data?.calendars ?? []),
    ready: queries.every((query) => query.isSuccess),
  };
}
