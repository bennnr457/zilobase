import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  calendarDate,
  calendarEventKey,
  calendarRangeReady,
  calendarSelectionKey,
  calendarSelectionMissing,
  matchingCalendarSnapshots,
  resolveDefaultCalendar,
  newCalendarEvent,
  normalizeCalendarView,
  todayInZone,
  dayInstant,
  addCalendarDays,
  visibleScheduleEvent,
  eventClock,
  calendarCapability,
  type CalendarConnection,
  type CalendarEvent,
  type CalendarPreferences,
  type CalendarRecord,
  type CalendarView,
  type CalendarCacheStore,
  type PendingCalendarMutation,
} from "@zilobase/features/calendar";
import { useSession } from "@zilobase/features/auth/react";
import { useCalendarEventCommands } from "@zilobase/features/calendar/react";
import { CalendarRenderer } from "../../primitives/components/calendar-renderer";
import { CalendarToolbar } from "../../workspace/components/calendar-toolbar";
import {
  useCalendarWorkspace,
  type CalendarCommand,
} from "../../workspace/components/calendar-workspace";
import {
  calendarDestinationRange,
  useCalendarNavigation,
} from "../../workspace/hooks/calendar-navigation";
import { useCalendarCache } from "../../sync/hooks/use-calendar-cache";
import { useCalendarPreferences } from "../../preferences/hooks/use-calendar-preferences";
import { useCalendarDisplayPreferences } from "../../preferences/components/calendar-travel";
import { useCalendarBuffers } from "../../preferences/components/calendar-buffer-preferences";
import { CalendarTimeZones } from "../../preferences/components/calendar-time-zones";
import { CalendarSearchResults } from "./calendar-search-results";
import { CalendarEventPanel } from "./calendar-event-panel";
import { CalendarMeetingPreview } from "./calendar-meeting-preview";
import { CalendarSourcePanel } from "./calendar-source-panel";
import { CalendarStatus } from "./calendar-status";
import {
  googleCalendarEvent,
  googleSlotRange,
  googleEventTiming,
  googleEventProposal,
} from "../lib/reui-events";
import type {
  EventCalendarProposedUpdate,
  EventCalendarSlotDraft,
  EventCalendarSlotInfo,
} from "@/components/ui/event-calendar/event-calendar-types";
import { getDayKey } from "@/components/ui/event-calendar/event-calendar-lib";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/platform/network/api";

type CalendarRange = { start: string; end: string };
type Snapshot = {
  readLatencyMs: number;
  requestKey?: string;
  coverage: { calendarId: string; ranges: CalendarRange[] }[];
  catalogLoaded: boolean;
  refresh: () => void;
  events: CalendarEvent[];
  calendars: CalendarRecord[];
  database: CalendarCacheStore | null;
  pending: PendingCalendarMutation[];
  error?: unknown;
  loaded: boolean;
  syncing: boolean;
  online: boolean;
  stale: boolean;
};
function AccountData({
  connection,
  userId,
  start,
  end,
  target,
  hiddenKeys,
  onData,
}: {
  connection: CalendarConnection;
  userId: string;
  start: string;
  end: string;
  target: CalendarRange | null;
  hiddenKeys: string[];
  onData: (binding: string, data: Snapshot) => void;
}) {
  const cache = useCalendarCache(connection, userId, start, end, { target, hiddenKeys });
  const refresh = useCallback(() => {
    void cache.refresh();
  }, [cache.refresh]);
  useEffect(() => {
    onData(connection.bindingId, {
      readLatencyMs: cache.readLatencyMs,
      pending: cache.pending,
      requestKey: cache.requestKey,
      coverage: cache.coverage ?? [],
      catalogLoaded: cache.catalogLoaded ?? false,
      refresh,
      events: cache.events ?? [],
      calendars: cache.calendars ?? [],
      database: cache.database,
      error: cache.error,
      loaded: cache.loaded ?? false,
      syncing: cache.syncing,
      online: cache.online,
      stale: cache.stale ?? true,
    });
  }, [
    connection.bindingId,
    cache.readLatencyMs,
    cache.pending,
    cache.events,
    cache.calendars,
    cache.coverage,
    cache.catalogLoaded,
    cache.database,
    cache.error,
    cache.loaded,
    cache.syncing,
    cache.online,
    cache.stale,
    refresh,
    onData,
  ]);
  return null;
}

export function CalendarSchedule({
  connections,
  userId,
  preferences: savedPreferences,
  preferenceWorkspaceId,
  onSettings = () => {},
}: {
  preferenceWorkspaceId?: string;
  connections: CalendarConnection[];
  userId: string;
  preferences: CalendarPreferences;
  onSettings?: () => void;
}) {
  const workspace = useCalendarWorkspace();
  const { data: session } = useSession();
  const preferenceStore = useCalendarPreferences(
    preferenceWorkspaceId ?? connections[0]!.workspaceId,
  );
  const preferences = useCalendarDisplayPreferences(savedPreferences);
  const search = useSearch({ from: "/app/calendar" }),
    navigate = useNavigate();
  const view = normalizeCalendarView(search.view ?? preferences.view);
  const date = search.date ?? todayInZone(preferences.timeZone);
  const scope = JSON.stringify([
    userId,
    session?.session?.id,
    preferenceWorkspaceId,
    connections.map((c) => [c.workspaceId, c.bindingId]),
  ]);
  const liveScope = useRef<string | null>(scope);
  liveScope.current = scope;
  useEffect(
    () => () => {
      liveScope.current = null;
    },
    [],
  );
  const commands = useCalendarEventCommands(null, scope);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [editing, setEditing] = useState(false),
    [creating, setCreating] = useState(false);
  const [proposal, setProposal] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setSnapshots({});
    setSelected(null);
    setEditing(false);
    setCreating(false);
    setProposal(false);
    return workspace.reset;
  }, [scope]);
  const onData = useCallback(
    (binding: string, value: Snapshot) => setSnapshots((old) => ({ ...old, [binding]: value })),
    [],
  );
  const data = useMemo(
    () => matchingCalendarSnapshots(connections, snapshots, userId),
    [connections, snapshots, userId],
  );
  const calendars = useMemo(() => data.flatMap((d) => d.calendars), [data]);
  const calendarsByKey = useMemo(
    () => new Map(calendars.map((c) => [calendarSelectionKey(c.bindingId, c.id), c])),
    [calendars],
  );
  const events = useMemo(
    () => data.flatMap((d) => d.events).filter((event) => visibleScheduleEvent(event, preferences)),
    [data, preferences],
  );
  const pendingKeys = useMemo(
    () => new Set(data.flatMap((d) => d.pending.map((p) => p.eventKey))),
    [data],
  );
  const online = data.length === connections.length && data.every((d) => d.online);
  const range = useMemo(
    () => calendarDestinationRange({ date, view }, preferences),
    [date, view, preferences.timeZone, preferences.weekStartsOn],
  );
  const ready = useCallback(
    (target: CalendarRange) =>
      calendarRangeReady(connections, snapshots, userId, preferences, target),
    [connections, snapshots, userId, preferences],
  );
  const navigation = useCalendarNavigation({
    ready,
    online,
    error: data.find((d) => d.error)?.error,
    initial: range,
    retry: () => data.forEach((d) => d.refresh()),
  });
  useEffect(() => workspace.setVisibleDate(date), [date, workspace.setVisibleDate]);
  useEffect(
    () =>
      workspace.registerNavigation((next, commit) =>
        navigation.request(calendarDestinationRange(next, preferences), commit),
      ),
    [
      workspace.registerNavigation,
      navigation.request,
      preferences.timeZone,
      preferences.weekStartsOn,
    ],
  );
  const destination = useCallback(
    (nextDate: string, nextView: CalendarView = view) => {
      workspace.navigateCalendar({ date: nextDate, view: nextView }, () => {
        void navigate({ to: "/calendar", search: { date: nextDate, view: nextView } });
      });
    },
    [view, navigate, workspace.navigateCalendar],
  );
  const { value: buffers } = useCalendarBuffers();
  const cacheStart = dayInstant(
    addCalendarDays(
      calendarDate({ dateTime: range.start, timeZone: preferences.timeZone }, preferences.timeZone),
      -(view === "month" ? buffers.monthBefore : buffers.before),
    ),
    preferences.timeZone,
  );
  const cacheEnd = dayInstant(
    addCalendarDays(
      calendarDate({ dateTime: range.end, timeZone: preferences.timeZone }, preferences.timeZone),
      view === "month" ? buffers.monthAfter : buffers.after,
    ),
    preferences.timeZone,
  );
  const hiddenKeys = useMemo(
    () => [...preferences.hiddenCalendarKeys, ...preferences.removedCalendarKeys],
    [preferences.hiddenCalendarKeys, preferences.removedCalendarKeys],
  );
  const open = useCallback(
    (event: CalendarEvent) =>
      workspace.confirmPanelChange(() => {
        workspace.showSource(null);
        workspace.openPanel();
        setEditing(false);
        setCreating(false);
        setProposal(false);
        setSelected(event);
        void navigate({
          to: "/calendar",
          search: {
            date: workspace.query.trim() ? calendarDate(event.start, preferences.timeZone) : date,
            view,
            binding: event.bindingId,
            calendar: event.calendarId,
            event: event.eventId,
          },
        });
      }),
    [
      workspace.confirmPanelChange,
      workspace.showSource,
      workspace.openPanel,
      workspace.query,
      date,
      view,
      preferences.timeZone,
      navigate,
    ],
  );
  useEffect(() => {
    if (!search.event || editing || creating) return;
    const event = events.find(
      (event) =>
        event.eventId === search.event &&
        event.calendarId === search.calendar &&
        event.bindingId === search.binding,
    );
    if (event) {
      setSelected(event);
      workspace.openPanel();
    }
  }, [
    events,
    search.event,
    search.calendar,
    search.binding,
    editing,
    creating,
    workspace.openPanel,
  ]);
  const canCreate = online && Boolean(resolveDefaultCalendar(calendars, preferences));
  const createRange = useCallback(
    (slot: EventCalendarSlotDraft | EventCalendarSlotInfo, target?: CalendarRecord) => {
      if (!canCreate) return;
      const calendar = target ?? resolveDefaultCalendar(calendars, preferences);
      if (!calendar || !calendarCapability("create", calendar.permissions).allowed) return;
      const connection = connections.find((c) => c.bindingId === calendar.bindingId);
      if (!connection) return;
      const range = googleSlotRange(slot, preferences.timeZone);
      const event = newCalendarEvent({
        ...connection,
        calendarId: calendar.id,
        date: getDayKey(range.start, preferences.timeZone),
        timeZone: preferences.timeZone,
      });
      workspace.confirmPanelChange(() => {
        workspace.showSource(null);
        workspace.openPanel();
        setSelected({ ...event, title: "", ...googleEventTiming(range, preferences.timeZone) });
        setCreating(true);
        setEditing(true);
        setProposal(false);
      });
    },
    [
      canCreate,
      calendars,
      preferences,
      connections,
      workspace.showSource,
      workspace.openPanel,
      workspace.confirmPanelChange,
    ],
  );
  const create = useCallback(
    (day = date, hour = 9, duration = 60, target?: CalendarRecord) => {
      const seed = newCalendarEvent({
        ...connections[0]!,
        calendarId: target?.id ?? "",
        date: day,
        timeZone: preferences.timeZone,
        hour,
      });
      const start = new Date(seed.start.dateTime!);
      createRange(
        { start, end: new Date(start.getTime() + duration * 60000), allDay: false, view },
        target,
      );
    },
    [date, preferences.timeZone, connections, view, createRange],
  );
  const close = useCallback(() => {
    setSelected(null);
    setEditing(false);
    setCreating(false);
    setProposal(false);
    void navigate({ to: "/calendar", search: { date, view } });
  }, [date, view, navigate]);
  useEffect(
    () => workspace.register({ close, create: () => create() }),
    [workspace.register, close, create],
  );
  useCalendarScheduleCommands({
    events,
    selected,
    create,
    open,
    canCreate,
    calendars,
    connections,
    workspace,
  });
  const update = useCallback(
    (update: EventCalendarProposedUpdate<CalendarEvent>) => {
      const original = update.event.data;
      if (
        !original ||
        !online ||
        pendingKeys.has(calendarEventKey(original)) ||
        !calendarCapability(
          "update",
          calendarsByKey.get(calendarSelectionKey(original.bindingId, original.calendarId))
            ?.permissions,
          original,
        ).allowed
      )
        return false;
      const proposed = googleEventProposal(update, preferences.timeZone);
      if (!proposed) return false;
      if (original.recurringEventId || original.attendees.length) {
        workspace.showSource(null);
        workspace.openPanel();
        setSelected(proposed);
        setProposal(true);
        setEditing(true);
        setCreating(false);
        return false;
      }
      const database = snapshots[original.bindingId]?.database;
      const capture = liveScope.current;
      if (database)
        void commands
          .run({
            database,
            event: original,
            action: "update",
            write: {
              operationId: crypto.randomUUID(),
              etag: original.etag,
              sendUpdates: "none",
              event: { start: proposed.start, end: proposed.end },
            },
          })
          .then((result) => {
            if (capture === liveScope.current && result.status !== "succeeded")
              toast.info("Change pending. Zilobase is checking delivery.");
          })
          .catch((error) => {
            if (capture === liveScope.current) toast.error(getApiErrorMessage(error));
          });
      return false;
    },
    [
      online,
      pendingKeys,
      calendarsByKey,
      preferences.timeZone,
      snapshots,
      commands.run,
      workspace.openPanel,
      workspace.showSource,
    ],
  );
  const items = useMemo(() => {
    const list = events
      .map((event) =>
        googleCalendarEvent(
          event,
          calendarsByKey.get(calendarSelectionKey(event.bindingId, event.calendarId)),
          preferences,
          online,
          pendingKeys.has(calendarEventKey(event)),
        ),
      )
      .filter((event) => event !== null);
    if (selected && editing && (creating || proposal)) {
      const preview = googleCalendarEvent(
        selected,
        calendarsByKey.get(calendarSelectionKey(selected.bindingId, selected.calendarId)),
        preferences,
        false,
      );
      if (preview)
        return [
          ...list.filter((event) => event.id !== preview.id),
          { ...preview, title: selected.title || "New event", readOnly: true },
        ];
    }
    return list;
  }, [
    events,
    calendarsByKey,
    preferences,
    online,
    pendingKeys,
    selected,
    editing,
    creating,
    proposal,
  ]);
  const selection =
    selected && !calendarSelectionMissing(selected, snapshots[selected.bindingId], connections)
      ? {
          event: selected,
          database: snapshots[selected.bindingId]?.database ?? null,
          calendars: snapshots[selected.bindingId]?.calendars ?? [],
        }
      : { event: null, database: null, calendars: [] };
  const sourceConnection = connections.find((c) => c.bindingId === workspace.source?.bindingId);
  const sourceCalendar = calendars.find(
    (c) => c.bindingId === workspace.source?.bindingId && c.id === workspace.source?.calendarId,
  );
  const zoneColumns = [...preferences.timeZoneColumns].reverse();
  const i18n = useMemo(
    () => ({
      formats: {
        timeGutter: preferences.timeFormat === "12" ? "ha" : "HH:mm",
        timeGutterMinute: preferences.timeFormat === "12" ? "h:mma" : "HH:mm",
        eventTime: preferences.timeFormat === "12" ? "h:mma" : "HH:mm",
      },
    }),
    [preferences.timeFormat],
  );
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-3" data-google-calendar>
      {connections.map((connection) => (
        <AccountData
          key={`${userId}:${connection.workspaceId}:${connection.bindingId}`}
          connection={connection}
          userId={userId}
          start={cacheStart}
          end={cacheEnd}
          target={navigation.target ?? range}
          hiddenKeys={hiddenKeys}
          onData={onData}
        />
      ))}
      <CalendarRenderer<CalendarEvent>
        className="min-h-0 flex-1"
        events={items}
        date={new Date(dayInstant(date, preferences.timeZone))}
        view={view}
        timeZone={preferences.timeZone}
        weekStartsOn={preferences.weekStartsOn}
        onDateChange={(next) => destination(getDayKey(next, preferences.timeZone))}
        onViewChange={(next) => {
          if (next === "days" || next === "resource") return;
          destination(date, next);
          void preferenceStore.save
            .mutateAsync({ ...savedPreferences, view: next })
            .catch(() => {});
        }}
        enableShortcuts={false}
        scrollMode="contained"
        maxEventsPerCell={3}
        showDayAddButton={canCreate}
        viewSettings={{
          weekends: preferences.showWeekends,
          weekNumbers: preferences.showWeekNumbers,
        }}
        i18n={i18n}
        hourHeight={preferences.hourHeight}
        allDayCollapsed={collapsed}
        onAllDayCollapsedChange={setCollapsed}
        style={{ "--ec-gutter-width": `${24 + 56 * zoneColumns.length}px` } as CSSProperties}
        renderTimeGutterHeader={() => (
          <CalendarTimeZones
            value={savedPreferences}
            onChange={(value) => preferenceStore.save.mutateAsync(value)}
            travelZone={workspace.travelZone}
            onRestore={() => workspace.setTravelZone(null)}
            date={new Date(dayInstant(date, preferences.timeZone))}
          />
        )}
        renderTimeGutterSlot={({ time }) => (
          <span className="flex">
            {zoneColumns.map((column) => (
              <span key={column.zone} className="w-14 text-right">
                {eventClock(
                  { dateTime: time.toISOString(), timeZone: column.zone },
                  column.zone,
                  preferences.timeFormat,
                )}
              </span>
            ))}
          </span>
        )}
        interactions={{
          drag: online && !editing,
          resize: online && !editing,
          selectSlot: canCreate && !editing,
        }}
        canSelectSlot={() => canCreate && !editing}
        onSlotClick={(slot) => {
          if (!editing) createRange(slot);
        }}
        onSelectSlot={(slot) => {
          if (!editing) createRange(slot);
        }}
        onEventClick={({ event }) => {
          if (event.data && !creating) open(event.data);
        }}
        onEventUpdate={update}
        actions={
          <CalendarToolbar
            preferences={savedPreferences}
            onPreferences={(value) => preferenceStore.save.mutateAsync(value)}
            onSettings={onSettings}
          />
        }
        beforeContent={
          <>
            <CalendarStatus data={data} online={online} error={navigation.error} />
            {data.some((d) => d.database?.persistent === false) && (
              <p role="status" className="py-1 text-xs text-content-secondary">
                Calendar is using temporary storage. Offline events are available only during this
                session.
              </p>
            )}
            {navigation.pending && (
              <div className="flex items-center gap-2 py-1 text-xs" role="status">
                Loading selected dates…
                <Button variant="ghost" size="sm" onClick={navigation.retry}>
                  Retry
                </Button>
                <Button variant="ghost" size="sm" onClick={navigation.cancel}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        }
        content={
          workspace.query.trim() ? (
            <CalendarSearchResults
              query={workspace.query}
              connections={connections}
              calendars={calendars}
              preferences={preferences}
              cached={events}
              online={online}
              userId={userId}
              onSelect={open}
            />
          ) : undefined
        }
        renderEvent={({ occurrence }) => {
          const event = occurrence.event.data;
          const pending = pendingKeys.has(String(occurrence.eventId));
          return (
            <span
              data-calendar-event-card
              data-calendar-pending={pending || undefined}
              className={`flex min-w-0 items-center gap-1 ${pending ? "animate-pulse" : ""} ${event?.attendees.some((a) => a.self && a.responseStatus === "needsAction") ? "border-b border-dashed" : ""}`}
            >
              <span className="truncate">{occurrence.event.title}</span>
              {event?.status === "tentative" && <span className="opacity-70">?</span>}
            </span>
          );
        }}
      />
      {scheduleDock({
        workspace,
        sourceConnection,
        sourceCalendar,
        calendars,
        userId,
        preferences,
        preferenceWorkspaceId,
        connections,
        open,
        create,
        snapshots,
        selection,
        online,
        editing,
        creating,
        selected,
        setSelected,
        setCreating,
        setEditing,
      })}
    </div>
  );
}

function useCalendarScheduleCommands(input: {
  events: CalendarEvent[];
  selected: CalendarEvent | null;
  create: (day?: string, hour?: number, duration?: number, target?: CalendarRecord) => void;
  open: (event: CalendarEvent) => void;
  canCreate: boolean;
  calendars: CalendarRecord[];
  connections: CalendarConnection[];
  workspace: ReturnType<typeof useCalendarWorkspace>;
}) {
  const commandState = useRef({
    events: input.events,
    selected: input.selected,
    create: input.create,
    open: input.open,
  });
  commandState.current = {
    events: input.events,
    selected: input.selected,
    create: input.create,
    open: input.open,
  };
  const featureCommands = useMemo<CalendarCommand[]>(
    () =>
      scheduleFeatureCommands(
        commandState,
        input.canCreate,
        input.calendars,
        input.connections,
        input.workspace.showSource,
      ),
    [
      input.canCreate,
      input.calendars,
      input.connections,
      input.workspace.showSource,
      input.events.length,
    ],
  );
  useEffect(() => {
    input.workspace.setFeatureCommands(featureCommands);
  }, [featureCommands, input.workspace.setFeatureCommands]);
}
function scheduleFeatureCommands(
  commandState: {
    current: {
      events: CalendarEvent[];
      selected: CalendarEvent | null;
      create: (day?: string, hour?: number, duration?: number, target?: CalendarRecord) => void;
      open: (event: CalendarEvent) => void;
    };
  },
  canCreate: boolean,
  calendars: CalendarRecord[],
  connections: CalendarConnection[],
  showSource: (value: { bindingId: string; calendarId: string } | null) => void,
): CalendarCommand[] {
  const canTraverse = commandState.current.events.length > 0;
  return [
    {
      id: "create",
      label: "Create event",
      shortcut: "C",
      disabled: !canCreate,
      run: () => commandState.current.create(),
    },
    {
      id: "next-event",
      label: "Next event",
      shortcut: "J",
      disabled: !canTraverse,
      run: () => traverseCalendarEvents(commandState.current, 1),
    },
    {
      id: "previous-event",
      label: "Previous event",
      shortcut: "K",
      disabled: !canTraverse,
      run: () => traverseCalendarEvents(commandState.current, -1),
    },
    ...calendars.map((calendar) => ({
      id: `source:${calendarSelectionKey(calendar.bindingId, calendar.id)}`,
      label: `Open calendar: ${calendar.name} · ${connections.find((connection) => connection.bindingId === calendar.bindingId)?.email ?? ""}`,
      run: () => showSource({ bindingId: calendar.bindingId, calendarId: calendar.id }),
    })),
  ];
}

function traverseCalendarEvents(
  state: {
    events: CalendarEvent[];
    selected: CalendarEvent | null;
    open: (event: CalendarEvent) => void;
  },
  direction: number,
) {
  if (!state.events.length) return;
  const index = state.selected
    ? state.events.findIndex(
        (event) => calendarEventKey(event) === calendarEventKey(state.selected!),
      )
    : -1;
  state.open(state.events[(index + direction + state.events.length) % state.events.length]!);
}
function scheduleDock(props: {
  workspace: ReturnType<typeof useCalendarWorkspace>;
  sourceConnection?: CalendarConnection;
  sourceCalendar?: CalendarRecord;
  calendars: CalendarRecord[];
  userId: string;
  preferences: CalendarPreferences;
  preferenceWorkspaceId?: string;
  connections: CalendarConnection[];
  open: (event: CalendarEvent) => void;
  create: (day?: string, hour?: number, duration?: number, target?: CalendarRecord) => void;
  snapshots: Record<string, Snapshot>;
  selection: {
    event: CalendarEvent | null;
    database: CalendarCacheStore | null;
    calendars: CalendarRecord[];
  };
  online: boolean;
  editing: boolean;
  creating: boolean;
  selected: CalendarEvent | null;
  setSelected: (event: CalendarEvent | null) => void;
  setCreating: (value: boolean) => void;
  setEditing: (value: boolean) => void;
}) {
  if (!props.workspace.source)
    return (
      <CalendarEventPanel
        preview={
          props.workspace.panelOpen ? (
            <CalendarMeetingPreview
              connections={props.connections}
              userId={props.userId}
              preferences={props.preferences}
              onSelect={props.open}
            />
          ) : undefined
        }
        selected={props.selection.event}
        database={props.selection.database}
        calendars={props.creating ? props.calendars : props.selection.calendars}
        stores={
          new Map(
            Object.entries(props.snapshots).flatMap(([key, snapshot]) =>
              snapshot.database ? [[key, snapshot.database] as const] : [],
            ),
          )
        }
        online={props.online}
        editing={props.editing}
        creating={props.creating}
        mapsProvider={props.preferences.mapsProvider}
        zone={props.preferences.timeZone}
        timeFormat={props.preferences.timeFormat}
        onClose={props.workspace.closePanel}
        onEdit={() => props.setEditing(true)}
        onDuplicate={() => {
          if (!props.selected) return;
          props.setSelected({
            ...props.selected,
            eventId: `local-${crypto.randomUUID()}`,
            etag: "",
            title: `${props.selected.title} (copy)`,
            attendees: [],
            recurringEventId: undefined,
            originalStartTime: undefined,
            recurrence: undefined,
          });
          props.setCreating(true);
          props.setEditing(true);
        }}
      />
    );
  if (props.sourceConnection && props.sourceCalendar)
    return (
      <CalendarSourcePanel
        key={`${props.sourceConnection.bindingId}:${props.sourceCalendar.id}`}
        connection={props.sourceConnection}
        calendar={props.sourceCalendar}
        allCalendars={props.calendars}
        userId={props.userId}
        preferences={props.preferences}
        preferenceWorkspaceId={props.preferenceWorkspaceId ?? props.connections[0]!.workspaceId}
        onSelect={props.open}
        onCreate={() =>
          props.create(todayInZone(props.preferences.timeZone), 9, 60, props.sourceCalendar)
        }
      />
    );
  return createPortal(
    <div data-calendar-event-panel className="grid gap-3 p-3">
      <p role="status">
        {!props.sourceConnection || props.snapshots[props.sourceConnection.bindingId]?.loaded
          ? "This calendar is no longer available."
          : "Loading calendar…"}
      </p>
      <Button variant="outline" onClick={props.workspace.closePanel}>
        Close
      </Button>
    </div>,
    props.workspace.panelElement,
  );
}
