import { useDatabaseViewBreakout } from "../../shared/hooks/use-database-view-breakout";
import { CalendarPlus, ChevronDown, GripVertical } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type {
  CalendarEvent,
  CalendarView,
  EventCalendarOccurrence,
  EventCalendarSlotDraft,
  EventCalendarSlotInfo,
} from "@/components/ui/event-calendar/event-calendar-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPaletteColor } from "@/lib/color-tokens";
import { cn } from "@/lib/utils";
import { DatabasePropertyValue } from "../../../properties/editors/components/database-property-value";
import { CalendarRenderer } from "@/sections/calendar/primitives/components/calendar-renderer";
import { DefaultPageIcon, PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";
import { useZilobaseFeatures } from "@zilobase/features";
import { useSession } from "@zilobase/features/auth/react";
import { useSharedDataRevision } from "@zilobase/features/data/react";
import {
  calendarClickSchedule,
  calendarScheduleToValue,
  databaseItemMatchesFilter,
  getDatabaseCalendarMode,
  getRawDatabaseGroupValue,
  getTimelineDatePropertyId,
  getTimelineStatusForValue,
  parseCalendarSchedule,
  type DatabaseCalendarMode,
  type DatabaseCalendarSchedule,
} from "@zilobase/features/databases";
import { getPageEmoji, readCachedPage } from "@zilobase/features/pages";
import { addMinutes } from "date-fns";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { toast } from "sonner";
import { DatabaseRecordWindowControl } from "../../shared/components/database-record-window-control";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../../state/components/database-view-context";

const rowMime = "application/x-zilobase-calendar-row";

function CalendarRecordIcon({ pageId }: { pageId: string }) {
  const { queryClient } = useZilobaseFeatures();
  useSharedDataRevision(queryClient);
  const page = readCachedPage(queryClient, pageId);
  const emoji = page ? getPageEmoji(page) : null;
  return emoji ? <PageIconDisplay size="sm" value={emoji} /> : <DefaultPageIcon page={page} />;
}

export function DatabaseCalendarView() {
  const {
    addCalendarRow,
    onOpenPage,
    savePropertyValue,
    setCalendarMode,
    setViewDateProperty,
    setupTimelineDateProperty,
    updateDatabasePropertyConfig,
  } = useDatabaseActionsContext();
  const {
    databaseId,
    hostDatabaseId,
    editable,
    activeConditionalColors,
    sortedItems,
    properties,
    visibleProperties,
    personOptions,
    propertyValuesByKey,
    calendarDateProperty,
    timelineDateProperties,
    hasNextPage,
  } = useDatabaseDataContext();
  const { activeView, showPageIconInTitle, titlePropertyLabel } = useDatabaseUiContext();
  const { data: session } = useSession();
  const root = useRef<HTMLDivElement>(null);
  const breakout = useDatabaseViewBreakout(root, true, activeView?.id);
  const [mode, setMode] = useState<DatabaseCalendarMode>(() =>
    getDatabaseCalendarMode(activeView?.config),
  );
  const savedMode = getDatabaseCalendarMode(activeView?.config);
  useEffect(() => setMode(savedMode), [activeView?.id, savedMode]);
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);
  const [draggingUnscheduled, setDraggingUnscheduled] = useState(false);
  const [height, setHeight] = useState(560);
  const [creating, setCreating] = useState(false);
  const request = useRef<symbol | null>(null);
  const mounted = useRef(false);
  const scope = `${session?.session?.id ?? ""}:${databaseId}:${hostDatabaseId}:${activeView?.id}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    request.current = null;
    setCreating(false);
    setUnscheduledOpen(false);
    setDraggingUnscheduled(false);
  }, [scope]);
  useLayoutEffect(() => {
    const measure = () => {
      if (root.current)
        setHeight(
          Math.max(
            400,
            window.innerHeight - Math.max(0, root.current.getBoundingClientRect().top) - 16,
          ),
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (root.current?.parentElement) observer.observe(root.current.parentElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeView?.id]);

  const { events, unscheduled, rows } = useMemo(() => {
    const rows = new Map(sortedItems.map((row) => [row.id, row]));
    const events: CalendarEvent[] = [];
    const unscheduled = [] as typeof sortedItems;
    const personOptionsById = new Map(personOptions.map((person) => [person.id, person.name]));
    const statusProperty = properties.find((p) => p.property.type === "status");
    for (const row of sortedItems) {
      const value = calendarDateProperty
        ? (propertyValuesByKey[`${row.pageId}:${calendarDateProperty.property.id}`] ?? "")
        : "";
      const schedule = parseCalendarSchedule(value);
      if (!schedule) {
        unscheduled.push(row);
        continue;
      }
      const status = getTimelineStatusForValue(
        statusProperty
          ? getRawDatabaseGroupValue(
              propertyValuesByKey[`${row.pageId}:${statusProperty.property.id}`] ?? "",
            )
          : "",
        statusProperty ?? null,
      );
      // Calendar rules color the whole event, including rules saved with a table target.
      const conditionalColor = activeConditionalColors.find((setting) =>
        databaseItemMatchesFilter({
          filter: setting.filter,
          item: row,
          personOptionsById,
          properties,
          propertyValuesByKey,
        }),
      );
      events.push({
        id: row.id,
        title: row.page.name?.trim() || "Untitled",
        ...schedule,
        color: getPaletteColor(conditionalColor?.color ?? status.color) ?? undefined,
        readOnly: !editable,
      });
    }
    return { events, unscheduled, rows };
  }, [
    sortedItems,
    properties,
    calendarDateProperty,
    propertyValuesByKey,
    editable,
    activeConditionalColors,
    personOptions,
  ]);
  const eventRanks = useMemo(
    () => new Map(sortedItems.map((row, index) => [row.id, index])),
    [sortedItems],
  );
  const eventOrder = useCallback(
    (a: EventCalendarOccurrence, b: EventCalendarOccurrence) =>
      a.start.getTime() - b.start.getTime() ||
      (eventRanks.get(a.eventId) ?? 0) - (eventRanks.get(b.eventId) ?? 0),
    [eventRanks],
  );
  const open = useCallback(
    (pageId: string, focusTitle = false) =>
      onOpenPage?.(pageId, {
        databaseId: hostDatabaseId ?? databaseId,
        presentation: "dialog",
        focusTitle,
      }),
    [onOpenPage, hostDatabaseId, databaseId],
  );
  const create = useCallback(
    async (schedule: DatabaseCalendarSchedule) => {
      if (!editable || !calendarDateProperty || request.current) return;
      const token = Symbol();
      const startedScope = currentScope.current;
      request.current = token;
      setCreating(true);
      try {
        const row = await addCalendarRow(schedule);
        if (mounted.current && currentScope.current === startedScope && request.current === token)
          open(row.pageId, true);
      } catch (error) {
        if (mounted.current && currentScope.current === startedScope)
          toast.error(error instanceof Error ? error.message : "Couldn't create calendar record");
      } finally {
        if (mounted.current && request.current === token) {
          request.current = null;
          setCreating(false);
        }
      }
    },
    [editable, calendarDateProperty, addCalendarRow, open],
  );
  const createSlot = (slot: EventCalendarSlotDraft | EventCalendarSlotInfo) => {
    void create(
      "start" in slot
        ? { start: slot.start, end: slot.end, allDay: slot.allDay }
        : calendarClickSchedule(slot.date, slot.allDay),
    );
  };
  const setView = (view: CalendarView) => {
    if (view === "month" || view === "week" || view === "day" || view === "agenda") {
      setMode(view);
      setCalendarMode(view);
    }
  };
  const clearDrop = () =>
    root.current
      ?.querySelectorAll("[data-calendar-drop]")
      .forEach((el) => el.removeAttribute("data-calendar-drop"));
  const dropTarget = (event: DragEvent) => {
    const cell = (event.target as Element).closest<HTMLElement>("[data-ec-day]");
    if (!cell || !root.current?.contains(cell)) return null;
    const day = new Date(Number(cell.dataset.ecDay));
    if (cell.dataset.slot !== "event-calendar-day-column")
      return { cell, schedule: calendarClickSchedule(day, true) };
    const rect = cell.getBoundingClientRect();
    const from = Number(cell.dataset.ecBoundsStart);
    const to = Number(cell.dataset.ecBoundsEnd);
    const minutes = Math.max(
      from,
      Math.min(
        to - 30,
        from + Math.floor((((event.clientY - rect.top) / rect.height) * (to - from)) / 30) * 30,
      ),
    );
    return { cell, schedule: calendarClickSchedule(addMinutes(day, minutes), false) };
  };
  const drop = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes(rowMime)) return;
    event.preventDefault();
    event.stopPropagation();
    clearDrop();
    if (!editable || !calendarDateProperty) return;
    const row = unscheduled.find((row) => row.id === event.dataTransfer.getData(rowMime));
    const target = dropTarget(event);
    if (!row || !target) return;
    setUnscheduledOpen(false);
    setDraggingUnscheduled(false);
    const key = `${row.pageId}:${calendarDateProperty.property.id}`;
    savePropertyValue(
      row.id,
      calendarDateProperty.property.id,
      "date",
      propertyValuesByKey[key] ?? "",
      calendarScheduleToValue(target.schedule),
    );
    open(row.pageId);
  };
  const icon = (rowId: string) => {
    if (!showPageIconInTitle) return null;
    const row = rows.get(rowId);
    return row ? <CalendarRecordIcon pageId={row.pageId} /> : null;
  };
  if (!calendarDateProperty)
    return (
      <div className="database-empty-state flex flex-col items-center gap-3 py-10 text-sm text-content-secondary">
        <span>Calendar needs a date property</span>
        {timelineDateProperties.length ? (
          <Select
            value={getTimelineDatePropertyId(activeView?.config) ?? ""}
            disabled={!editable}
            onValueChange={setViewDateProperty}
          >
            <SelectTrigger aria-label="Calendar date property" className="min-w-56">
              <SelectValue placeholder="Choose a date property" />
            </SelectTrigger>
            <SelectContent>
              {timelineDateProperties.map((p) => (
                <SelectItem key={p.id} value={p.property.id}>
                  {p.property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={!editable}
            onClick={setupTimelineDateProperty}
          >
            <CalendarPlus />
            Set up date property
          </Button>
        )}
      </div>
    );

  const timed = mode === "day" || mode === "week";
  // The same lane height positions multi-day bars, their spacers and drag previews.
  const cardHeight = 32 + visibleProperties.length * 24;
  const renderRecord = ({ occurrence }: { occurrence: EventCalendarOccurrence }) => {
    const row = rows.get(String(occurrence.eventId));
    return (
      <span
        data-calendar-record={occurrence.eventId}
        className="flex w-full min-w-0 flex-col gap-1 overflow-hidden p-2"
      >
        <span className="flex min-w-0 items-center gap-1.5 font-medium leading-4">
          {showPageIconInTitle && (
            <span className="flex size-4 shrink-0 items-center justify-center">
              {icon(String(occurrence.eventId))}
            </span>
          )}
          <span className="truncate">{occurrence.event.title}</span>
        </span>
        {row &&
          visibleProperties.map((property) => (
            <span
              key={property.id}
              data-calendar-property={property.property.id}
              title={property.property.name}
              className="pointer-events-none flex h-5 min-w-0 shrink-0 items-center overflow-hidden text-xs font-normal [&>*]:min-h-0 [&>*]:w-auto [&>*]:max-w-full [&>*]:p-0"
            >
              <DatabasePropertyValue
                preview
                editable={false}
                properties={properties}
                propertyValuesByKey={propertyValuesByKey}
                onPropertyConfigChange={updateDatabasePropertyConfig}
                onSaveValue={savePropertyValue}
                persistedValue={propertyValuesByKey[`${row.pageId}:${property.property.id}`] ?? ""}
                personOptions={personOptions}
                property={property}
                row={row}
                titlePropertyLabel={titlePropertyLabel}
                wrapContent={false}
              />
            </span>
          ))}
      </span>
    );
  };
  return (
    <div
      ref={root}
      className="database-calendar-view min-w-0"
      style={breakout}
      onDragOverCapture={(event) => {
        if (!editable || !event.dataTransfer.types.includes(rowMime)) return;
        const target = dropTarget(event);
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        clearDrop();
        target.cell.setAttribute("data-calendar-drop", "true");
      }}
      onDragLeave={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node)) clearDrop();
      }}
      onDropCapture={drop}
      onDragEnd={() => {
        clearDrop();
        setDraggingUnscheduled(false);
      }}
    >
      <CalendarRenderer
        className="database-event-calendar gap-0 border-0 bg-surface-canvas text-content-primary"
        style={
          {
            height: timed ? height : undefined,
            minHeight: height,
            "--ec-month-row-min-h": `${Math.max(100, (height - 80) / 6)}px`,
            "--ec-month-bar-h": `${cardHeight + 2}px`,
          } as CSSProperties
        }
        events={events}
        titleActions={
          <Popover open={unscheduledOpen} onOpenChange={setUnscheduledOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1 text-content-secondary"
                aria-label={`Unscheduled (${unscheduled.length})`}
              >
                Unscheduled <span className="tabular-nums">{unscheduled.length}</span>
                <ChevronDown className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label="Unscheduled records"
              gap="compact"
              padding="menu"
              className={cn("w-72 max-w-[calc(100vw-2rem)]", draggingUnscheduled && "opacity-50")}
              onInteractOutside={(event) => {
                if (draggingUnscheduled) event.preventDefault();
              }}
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <div className="px-2 py-1.5 text-sm font-medium">Unscheduled</div>
              <div data-calendar-unscheduled className="max-h-64 overflow-y-auto">
                {unscheduled.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    data-calendar-unscheduled-row={row.id}
                    draggable={editable}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(rowMime, row.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDraggingUnscheduled(true);
                    }}
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-action-neutral-hover"
                    onClick={() => {
                      setUnscheduledOpen(false);
                      open(row.pageId);
                    }}
                  >
                    {editable && (
                      <GripVertical className="size-4 shrink-0 text-content-secondary" />
                    )}
                    {icon(row.id)}
                    <span className="truncate">{row.page.name?.trim() || "Untitled"}</span>
                  </button>
                ))}
                {!unscheduled.length && (
                  <div className="px-2 py-2 text-sm text-content-secondary">
                    All loaded records are scheduled.
                  </div>
                )}
              </div>
              {unscheduled.length > 0 && editable && (
                <div className="border-t border-stroke-default px-2 py-2 text-xs text-content-secondary">
                  Drag a page onto a date to schedule it.
                </div>
              )}
            </PopoverContent>
          </Popover>
        }
        view={mode}
        onViewChange={setView}
        eventOrder={eventOrder}
        classNames={{
          event: "items-start p-0",
          allDaySection: "max-h-[40%] shrink-0 overflow-y-auto",
        }}
        weekStartsOn={1}
        slotDuration={60}
        snapDuration={30}
        scrollMode={timed ? "contained" : "page"}
        scrollbars="native"
        showDayAddButton={editable && !creating}
        fixedWeeks
        showOutsideDays
        interactions={{
          drag: editable && !creating,
          resize: editable && !creating,
          selectSlot: editable && !creating,
        }}
        canSelectSlot={() => editable && !request.current}
        onSlotClick={createSlot}
        onSelectSlot={createSlot}
        onEventClick={(occurrence) => {
          const row = rows.get(String(occurrence.eventId));
          if (row) open(row.pageId);
        }}
        onEventUpdate={(update) => {
          const row = rows.get(String(update.event.id));
          if (!editable || !row || !calendarDateProperty) return false;
          const previous =
            propertyValuesByKey[`${row.pageId}:${calendarDateProperty.property.id}`] ?? "";
          savePropertyValue(
            row.id,
            calendarDateProperty.property.id,
            "date",
            previous,
            calendarScheduleToValue(
              { start: update.start, end: update.end, allDay: update.allDay },
              previous,
              update.source === "drag",
            ),
          );
          return { start: update.start, end: update.end, allDay: update.allDay };
        }}
        renderEvent={renderRecord}
        renderAgendaEvent={renderRecord}
      />
      {hasNextPage && (
        <div className="px-3 pt-2 text-sm text-content-secondary">
          More records are available. Load them to include their dates.
        </div>
      )}
      <DatabaseRecordWindowControl />
    </div>
  );
}
