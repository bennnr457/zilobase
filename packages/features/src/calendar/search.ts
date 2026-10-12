import { infiniteQueryOptions } from "@tanstack/react-query";
import type { ApiFetcher } from "../shared/api-fetcher";
import { calendarApiBasePath } from "./model";
import { dayInstant, addCalendarDays } from "../calendar-layout/time";
import type { CalendarRecord, CalendarConnection, CalendarEvent } from "./contracts";
type Cursor = { source: number; token?: string };

export function calendarSearchQueryOptions(
  apiFetch: ApiFetcher,
  input: {
    debounced: string;
    enabled: boolean;
    from: string;
    sources: { calendar: CalendarRecord; connection: CalendarConnection }[];
    timeZone: string;
    until: string;
    userId: string;
  },
) {
  return infiniteQueryOptions({
    enabled: input.enabled,
    initialPageParam: { source: 0 } as Cursor,
    queryFn: ({ pageParam, signal }) =>
      fetchSearchPage(
        apiFetch,
        input.sources,
        pageParam,
        signal,
        input.debounced,
        input.from,
        input.until,
        input.timeZone,
      ),
    getNextPageParam: (page) => nextSearchPage(page, input.sources.length),
    queryKey: [
      "calendar",
      "search",
      input.userId,
      input.sources.map(({ connection, calendar }) => [
        connection.workspaceId,
        connection.bindingId,
        calendar.id,
      ]),
      input.debounced,
      input.from,
      input.until,
      input.timeZone,
    ] as const,
    staleTime: 30_000,
  });
}

async function fetchSearchPage(
  apiFetch: ApiFetcher,
  sources: { calendar: CalendarRecord; connection: CalendarConnection }[],
  pageParam: Cursor,
  signal: AbortSignal,
  debounced: string,
  from: string,
  until: string,
  zone: string,
) {
  const selected = sources[pageParam.source]!;
  const params = new URLSearchParams({
    q: debounced,
    calendarId: selected.calendar.id,
    ...(from ? { start: dayInstant(from, zone) } : {}),
    ...(until ? { end: dayInstant(addCalendarDays(until, 1), zone) } : {}),
    ...(pageParam.token ? { pageToken: pageParam.token } : {}),
  });
  const page = await apiFetch<{ events: CalendarEvent[]; nextPageToken: string | null }>(
    `${calendarApiBasePath(selected.connection.workspaceId)}/connections/${encodeURIComponent(selected.connection.bindingId)}/search?${params}`,
    { signal },
  );
  return { ...page, source: pageParam.source };
}
function nextSearchPage(
  page: { nextPageToken: string | null; source: number },
  sourceCount: number,
): Cursor | undefined {
  if (page.nextPageToken) return { source: page.source, token: page.nextPageToken };
  if (page.source + 1 < sourceCount) return { source: page.source + 1 };
}
