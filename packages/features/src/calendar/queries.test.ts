import assert from "node:assert/strict";
import test from "node:test";
import type { ApiFetcher } from "../shared/api-fetcher";
import { ApiError } from "../shared/api-error";
import {
  calendarAccountsQueryOptions,
  calendarPreferencesQueryOptions,
  readCalendarRange,
} from "./queries";
import { definiteCalendarRejection, postCalendarMutation } from "./mutations";
import type { CalendarEvent } from "./contracts";

test("calendar queries retain account identity, cancellation and wire parameters", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const apiFetch = (async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return {};
  }) as ApiFetcher;
  const signal = new AbortController().signal;
  const accounts = calendarAccountsQueryOptions(apiFetch, "user", "work space");
  assert.deepEqual(accounts.queryKey, ["calendar", "sources", "user", "work space"]);
  assert.equal(accounts.refetchInterval, 30_000);
  assert.equal(accounts.retry, false);
  await accounts.queryFn!({ signal } as never);
  assert.equal(calls[0].path, "/workspaces/work%20space/calendar/sources");
  assert.equal(calls[0].init?.signal, signal);
  assert.equal(calendarPreferencesQueryOptions(apiFetch, "work space").staleTime, 60_000);
  await readCalendarRange(
    apiFetch,
    { workspaceId: "work space", bindingId: "a/b" },
    { calendarId: "cal", start: "from", end: "until", pageToken: "next" },
    signal,
  );
  assert.equal(
    calls[1].path,
    "/workspaces/work%20space/calendar/connections/a%2Fb/ranges?calendarId=cal&start=from&end=until&pageToken=next",
  );
});

test("calendar event requests and definite rejection classification preserve ambiguous writes", async () => {
  const apiFetch = (async (path: string, init?: RequestInit) => {
    assert.equal(path, "/workspaces/w/calendar/connections/b/calendars/c/events/e%2F1/move");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      operationId: "op",
      event: { title: "Next" },
      sendUpdates: "all",
      destination: "other",
    });
    return { status: "ambiguous", operationId: "op" };
  }) as ApiFetcher;
  const result = await postCalendarMutation(
    apiFetch,
    { workspaceId: "w", bindingId: "b" },
    {
      action: "move",
      event: { calendarId: "c", eventId: "e/1" } as CalendarEvent,
      write: { operationId: "op", event: { title: "Next" }, sendUpdates: "all" },
      destination: "other",
    },
  );
  assert.equal(result.status, "ambiguous");
  for (const status of [400, 401, 403, 404, 409])
    assert.equal(definiteCalendarRejection(new ApiError("rejected", status, {})), true);
  for (const status of [408, 429, 500])
    assert.equal(definiteCalendarRejection(new ApiError("retry", status, {})), false);
  assert.equal(definiteCalendarRejection(new TypeError("network")), false);
});
