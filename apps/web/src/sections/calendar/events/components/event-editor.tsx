import { EventTimingFields, EventRecurrenceFields } from "./event-timing-fields";
import { eventEditorZone, editorWrite } from "@zilobase/features/calendar";
import { eventEditorDefaults, type EventEditorDraft } from "../lib/event-editor-model";
import { useState, useEffect, useRef } from "react";
import { useCalendarEventCommands } from "@zilobase/features/calendar/react";
import { useCalendarWorkspace } from "../../workspace/components/calendar-workspace";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  calendarCapability,
  eventEditorCapability,
  calendarSelectionKey,
  type CalendarEvent,
  type CalendarRecord,
} from "@zilobase/features/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiErrorMessage } from "@/platform/network/api";
import type { CalendarCacheStore } from "@zilobase/features/calendar";
export function EventEditor({
  event,
  calendars,
  database,
  online,
  isNew,
  onSaved,
  onCancel,
  stores,
}: {
  event: CalendarEvent;
  calendars: CalendarRecord[];
  database: CalendarCacheStore;
  online: boolean;
  isNew: boolean;
  onSaved: () => void;
  onCancel: () => void;
  stores?: ReadonlyMap<string, CalendarCacheStore>;
}) {
  const commands = useCalendarEventCommands(database);
  const workspace = useCalendarWorkspace();
  const active = useRef(true),
    submitting = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isNew) return;
    let frame = 0,
      attempts = 0;
    const focus = () => {
      if (titleInput.current?.isConnected && !titleInput.current.closest("[inert]"))
        titleInput.current.focus({ preventScroll: true });
      else if (++attempts < 60) frame = requestAnimationFrame(focus);
    };
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [isNew]);
  const zone = eventEditorZone(event, calendars);
  const [draft, setDraft] = useState(() => eventEditorDefaults(event, zone));
  const initial = useRef(JSON.stringify(draft));
  const dirty = useRef(false);
  dirty.current = isNew || JSON.stringify(draft) !== initial.current;
  useEffect(
    () =>
      workspace.registerCloseGuard((close) => {
        if (dirty.current || submitting.current) setDiscard(() => close);
        else close();
      }),
    [workspace.registerCloseGuard],
  );
  const {
    title,
    description,
    location,
    guests,
    sendUpdates,
    calendarId,
    colorId,
    busy,
    visibility,
    defaultReminders,
    reminder,
    meet,
  } = draft;
  const setTitle = (value: EventEditorDraft["title"]) =>
    setDraft((current) => ({ ...current, title: value }));
  const setDescription = (value: EventEditorDraft["description"]) =>
    setDraft((current) => ({ ...current, description: value }));
  const setLocation = (value: EventEditorDraft["location"]) =>
    setDraft((current) => ({ ...current, location: value }));
  const setGuests = (value: EventEditorDraft["guests"]) =>
    setDraft((current) => ({ ...current, guests: value }));
  const setSendUpdates = (value: EventEditorDraft["sendUpdates"]) =>
    setDraft((current) => ({ ...current, sendUpdates: value }));
  const setCalendarId = (value: string) => {
    const [bindingId, calendarId] = JSON.parse(value) as [string, string];
    setDraft((current) => ({ ...current, bindingId, calendarId }));
  };
  const setColorId = (value: EventEditorDraft["colorId"]) =>
    setDraft((current) => ({ ...current, colorId: value }));
  const setBusy = (value: EventEditorDraft["busy"]) =>
    setDraft((current) => ({ ...current, busy: value }));
  const setVisibility = (value: EventEditorDraft["visibility"]) =>
    setDraft((current) => ({ ...current, visibility: value }));
  const setDefaultReminders = (value: EventEditorDraft["defaultReminders"]) =>
    setDraft((current) => ({ ...current, defaultReminders: value }));
  const setReminder = (value: EventEditorDraft["reminder"]) =>
    setDraft((current) => ({ ...current, reminder: value }));
  const setMeet = (value: EventEditorDraft["meet"]) =>
    setDraft((current) => ({ ...current, meet: value }));
  const [error, setError] = useState<unknown>(),
    [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [recurrence, setRecurrence] = useState<string[] | undefined>(),
    [scope, setScope] = useState<"occurrence" | "following" | "series">("occurrence");
  const targetStore = stores?.get(draft.bindingId) ?? database;
  const targetEvent = {
    ...event,
    bindingId: draft.bindingId,
    workspaceId: targetStore.identity.workspaceId,
  };
  const capability = eventEditorCapability(isNew, scope, calendars, targetEvent, calendarId);
  const save = async () => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await saveEventEditor({
        run: commands.run,
        current: () => active.current,
        online,
        capability,
        setPending,
        setError,
        setUncertain,
        event: targetEvent,
        draft,
        isNew,
        recurrence,
        scope,
        database: targetStore,
        calendarId,
        onSaved,
      });
    } finally {
      submitting.current = false;
    }
  };
  return (
    <form
      className="grid gap-4 text-xs/relaxed"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset
        className="grid gap-4"
        disabled={!online || pending || uncertain || !capability.allowed}
      >
        <Label className="grid min-w-0 gap-2">
          Title
          <Input
            ref={titleInput}
            autoFocus={isNew}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Label>
        <Label className="grid min-w-0 gap-2">
          Calendar
          <Select
            value={calendarSelectionKey(draft.bindingId, calendarId)}
            disabled={!isNew}
            onValueChange={setCalendarId}
          >
            <SelectTrigger aria-label="Calendar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {calendars
                .filter(
                  (c) =>
                    (isNew || c.bindingId === event.bindingId) &&
                    calendarCapability("create", c.permissions).allowed,
                )
                .map((c) => (
                  <SelectItem
                    key={calendarSelectionKey(c.bindingId, c.id)}
                    value={calendarSelectionKey(c.bindingId, c.id)}
                  >
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Label>
        <EventTimingFields
          draft={draft}
          update={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
        />
        <EventRecurrenceFields
          event={event}
          scope={scope}
          setScope={setScope}
          onChange={setRecurrence}
        />
        <Label className="grid min-w-0 gap-2">
          Guests
          <Input
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            placeholder="Emails separated by commas"
          />
        </Label>
        <Label className="grid min-w-0 gap-2">
          Location
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Label>
        <Label className="grid min-w-0 gap-2">
          Description
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Label>
        <Label className="flex items-center gap-2">
          <Checkbox checked={meet} onCheckedChange={(v) => setMeet(v === true)} />
          Create Google Meet link
        </Label>
        <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
          <Label className="grid min-w-0 gap-2">
            Show as
            <Select value={busy} onValueChange={(v) => setBusy(v as typeof busy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opaque">Busy</SelectItem>
                <SelectItem value="transparent">Free</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label className="grid min-w-0 gap-2">
            Visibility
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value as typeof visibility)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </Label>
        </div>
        <Label className="grid min-w-0 gap-2">
          Event color
          <Select value={colorId} onValueChange={setColorId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["default", ...Array.from({ length: 11 }, (_, i) => String(i + 1))].map((id) => (
                <SelectItem key={id} value={id}>
                  {id === "default" ? "Calendar color" : `Color ${id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
        <Label className="flex items-center gap-2">
          <Checkbox
            checked={defaultReminders}
            onCheckedChange={(v) => setDefaultReminders(v === true)}
          />
          Use calendar reminders
        </Label>
        {!defaultReminders && (
          <Label className="grid min-w-0 gap-2">
            Remind me before (minutes)
            <Input
              type="number"
              min={0}
              max={40320}
              value={reminder}
              onChange={(e) => setReminder(Number(e.target.value))}
            />
          </Label>
        )}
        <Label className="flex items-center gap-2">
          <Checkbox
            checked={sendUpdates === "all"}
            onCheckedChange={(v) => setSendUpdates(v ? "all" : "none")}
          />
          Send updates to guests
        </Label>
        <div className="sticky bottom-0 flex items-center gap-2 bg-surface-canvas py-2">
          <Button type="submit">{pending ? "Saving…" : "Save event"}</Button>
          <Button type="button" variant="ghost" disabled={pending || uncertain} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
      <EventEditorAlerts
        capability={capability}
        online={online}
        error={error}
        uncertain={uncertain}
        database={database}
        onSaved={onSaved}
        reconcile={commands.reconcile}
      />
      <AlertDialog
        open={discard !== null}
        onOpenChange={(open) => {
          if (!open) setDiscard(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved event changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The event has not been saved. Your draft will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || uncertain}
              onClick={() => {
                const close = discard;
                setDiscard(null);
                close?.();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
function EventEditorAlerts({
  capability,
  online,
  error,
  uncertain,
  database,
  onSaved,
  reconcile,
}: {
  capability: ReturnType<typeof calendarCapability>;
  online: boolean;
  error: unknown;
  uncertain: boolean;
  database: CalendarCacheStore;
  onSaved: () => void;
  reconcile: () => Promise<void>;
}) {
  return (
    <>
      {!capability.allowed && <p role="status">{capability.reason}</p>}
      {!online && <p>Reconnect to edit events.</p>}
      {error ? (
        <p role="alert" className="text-feedback-danger-text">
          {getApiErrorMessage(error)}
        </p>
      ) : null}
      {uncertain && (
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await reconcile();
            if (!(await database.readPending().then((rows) => rows.length))) onSaved();
          }}
        >
          Check delivery status
        </Button>
      )}
    </>
  );
}

async function saveEventEditor(input: {
  run: ReturnType<typeof useCalendarEventCommands>["run"];
  current: () => boolean;
  online: boolean;
  capability: ReturnType<typeof calendarCapability>;
  setPending: (value: boolean) => void;
  setError: (value: unknown) => void;
  setUncertain: (value: boolean) => void;
  event: CalendarEvent;
  draft: EventEditorDraft;
  isNew: boolean;
  recurrence: string[] | undefined;
  scope: "occurrence" | "following" | "series";
  database: CalendarCacheStore;
  calendarId: string;
  onSaved: () => void;
}) {
  if (!input.online || !input.capability.allowed) return;
  input.setPending(true);
  input.setError(undefined);
  try {
    const write = editorWrite(input.event, input.draft, input.isNew, input.recurrence, input.scope);
    const result = await input.run({
      database: input.database,
      event: { ...input.event, calendarId: input.calendarId },
      action: input.isNew ? "create" : "update",
      write,
    });
    if (!input.current()) return;
    if (result.status === "succeeded") input.onSaved();
    else {
      input.setUncertain(true);
      input.setError(new Error("Delivery is being checked. Do not create another copy."));
    }
  } catch (cause) {
    if (!input.current()) return;
    input.setError(cause);
    input.setUncertain((await input.database.readPending().then((rows) => rows.length)) > 0);
  } finally {
    if (input.current()) input.setPending(false);
  }
}
