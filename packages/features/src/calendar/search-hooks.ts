import { useInfiniteQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { calendarSearchQueryOptions } from "./search";
export function useCalendarSearch(input: Parameters<typeof calendarSearchQueryOptions>[1]) {
  const { apiFetch } = useZilobaseFeatures();
  return useInfiniteQuery(calendarSearchQueryOptions(apiFetch, input));
}
