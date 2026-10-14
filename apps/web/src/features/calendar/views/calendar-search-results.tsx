import { useEffect, useState } from "react";
import {
  calendarEventKey,
  eventClock,
  eventInstant,
  type CalendarConnection,
  type CalendarEvent,
  type CalendarPreferences,
  type CalendarRecord,
} from "@zilobase/features/calendar";
import { createCalendarSelectionMatcher, calendarSelectionKey } from "@zilobase/features/calendar";
import { getApiErrorMessage } from "@zilobase/features";
import {
  searchSources,
  searchLoadedEvents,
  matchesSearchEvent,
  uniqueSearchEvents,
} from "@zilobase/features/calendar";
import { useCalendarSearch } from "@zilobase/features/calendar/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export function CalendarSearchResults({
  query,
  connections,
  calendars,
  preferences,
  cached,
  online,
  userId,
  onSelect,
}: {
  query: string;
  connections: CalendarConnection[];
  calendars: CalendarRecord[];
  preferences: CalendarPreferences;
  cached: CalendarEvent[];
  online: boolean;
  userId: string;
  onSelect: (event: CalendarEvent) => void;
}) {
  const [debounced, setDebounced] = useState(""),
    [source, setSource] = useState("all"),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);
  const readable = calendars.filter(
    (calendar) => calendar.permissions.read && !calendar.permissions.freeBusyOnly,
  );
  const matcher = createCalendarSelectionMatcher(preferences);
  const sources = searchSources(readable, connections, source, matcher);
  const invalidRange = Boolean(from && until && until < from);
  const results = useCalendarSearch({
    debounced,
    enabled: searchQueryEnabled(online, debounced, query, sources.length, invalidRange),
    from,
    sources,
    timeZone: preferences.timeZone,
    until,
    userId,
  });
  const loaded = searchLoadedEvents(
    online,
    query,
    debounced,
    results.data?.pages.flatMap((page) => page.events) ?? [],
    cached,
  );
  const events = uniqueSearchEvents(
    loaded.filter((event) => matchesSearchEvent(event, sources, preferences, from, until)),
    preferences.timeZone,
  );
  return (
    <section aria-label="Calendar search results" className="min-h-0 flex-1 overflow-y-auto p-4">
      <SearchFilters
        source={source}
        setSource={setSource}
        readable={readable}
        connections={connections}
        from={from}
        setFrom={setFrom}
        until={until}
        setUntil={setUntil}
      />
      <SearchFeedback
        invalidRange={invalidRange}
        online={online}
        results={results}
        events={events}
        query={query}
        debounced={debounced}
      />
      <ul className="grid gap-2">
        {events.map((event) => (
          <li key={calendarEventKey(event)}>
            <Button
              variant="outline"
              className="h-auto w-full justify-start whitespace-normal text-left"
              onClick={() => onSelect(event)}
            >
              <span>
                {event.title}
                <span className="block text-xs text-content-secondary">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeZone: preferences.timeZone,
                  }).format(new Date(eventInstant(event.start, preferences.timeZone)))}{" "}
                  · {eventClock(event.start, preferences.timeZone, preferences.timeFormat)}
                </span>
              </span>
            </Button>
          </li>
        ))}
      </ul>
      {online && results.hasNextPage && (
        <Button
          className="mt-3"
          disabled={results.isFetching}
          onClick={() => void results.fetchNextPage()}
        >
          Load more results
        </Button>
      )}
    </section>
  );
}
function SearchFilters({
  source,
  setSource,
  readable,
  connections,
  from,
  setFrom,
  until,
  setUntil,
}: {
  source: string;
  setSource: (value: string) => void;
  readable: CalendarRecord[];
  connections: CalendarConnection[];
  from: string;
  setFrom: (value: string) => void;
  until: string;
  setUntil: (value: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Select value={source} onValueChange={setSource}>
        <SelectTrigger aria-label="Search source" className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All visible calendars</SelectItem>
          {readable.map((calendar) => (
            <SelectItem
              key={calendarSelectionKey(calendar.bindingId, calendar.id)}
              value={calendarSelectionKey(calendar.bindingId, calendar.id)}
            >
              {calendar.name} ·{" "}
              {connections.find((connection) => connection.bindingId === calendar.bindingId)?.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="text-xs">
        From
        <Input
          aria-label="Search from date"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </label>
      <label className="text-xs">
        Through
        <Input
          aria-label="Search through date"
          type="date"
          value={until}
          onChange={(event) => setUntil(event.target.value)}
        />
      </label>
    </div>
  );
}
function SearchFeedback({
  invalidRange,
  online,
  results,
  events,
  query,
  debounced,
}: {
  invalidRange: boolean;
  online: boolean;
  results: {
    error: unknown;
    isFetchNextPageError: boolean;
    fetchNextPage: () => Promise<unknown>;
    refetch: () => Promise<unknown>;
    isFetching: boolean;
  };
  events: CalendarEvent[];
  query: string;
  debounced: string;
}) {
  return (
    <>
      {invalidRange && <p role="alert">The end date must not precede the start date.</p>}
      {!online && <p role="status">Offline: searching cached events only.</p>}
      {results.error && (
        <div role="alert">
          {getApiErrorMessage(results.error)}
          <Button
            variant="outline"
            onClick={() =>
              void (results.isFetchNextPageError ? results.fetchNextPage() : results.refetch())
            }
          >
            Retry search
          </Button>
        </div>
      )}
      {results.isFetching || query.trim() !== debounced ? (
        <p role="status">Searching…</p>
      ) : (
        !events.length && !invalidRange && <p>No matching events.</p>
      )}
    </>
  );
}
function searchQueryEnabled(
  online: boolean,
  debounced: string,
  query: string,
  sourceCount: number,
  invalidRange: boolean,
) {
  return (
    online && Boolean(debounced) && query.trim() === debounced && sourceCount > 0 && !invalidRange
  );
}
