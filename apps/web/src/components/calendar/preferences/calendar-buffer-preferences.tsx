import {
  DEFAULT_CALENDAR_BUFFERS,
  normalizeCalendarBuffers,
  type CalendarBuffers,
} from "@zilobase/features/calendar";
import { useSyncExternalStore } from "react";
import { useSession } from "@zilobase/features/auth/react";
import { toApiUrl } from "@/platform/network/api";
import { Input } from "@/components/ui/input";
import { SettingsRow } from "@/components/settings/shell/settings-layout";
const changed = "calendar:buffers-changed";
function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(changed, listener);
    window.removeEventListener("storage", listener);
  };
}
export function useCalendarBuffers() {
  const { data: session } = useSession();
  const key = JSON.stringify([
    "calendar:buffers",
    new URL(toApiUrl("/"), window.location.origin).origin,
    session?.user?.id,
  ]);
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  let value = DEFAULT_CALENDAR_BUFFERS;
  try {
    value = normalizeCalendarBuffers(JSON.parse(raw ?? "null"));
  } catch {
    /* Use defaults for obsolete preferences. */
  }
  return {
    value,
    save(next: CalendarBuffers) {
      if (!session?.user?.id) return;
      localStorage.setItem(key, JSON.stringify(normalizeCalendarBuffers(next)));
      window.dispatchEvent(new Event(changed));
    },
  };
}
export function CalendarBufferSettings() {
  const { value, save } = useCalendarBuffers();
  return (
    <details className="py-1">
      <summary className="cursor-pointer text-sm font-medium">Advanced date loading</summary>
      <div className="mt-2 grid gap-2">
        {Object.entries({
          before: "Days before",
          after: "Days after",
          monthBefore: "Month view: days before",
          monthAfter: "Month view: days after",
        }).map(([key, label]) => (
          <SettingsRow key={key} title={label}>
            <Input
              aria-label={label}
              className="w-28"
              type="number"
              min={7}
              max={180}
              value={value[key as keyof CalendarBuffers]}
              onChange={(event) => {
                const count = Number(event.target.value);
                if (Number.isInteger(count) && count >= 7 && count <= 180)
                  save({ ...value, [key]: count });
              }}
            />
          </SettingsRow>
        ))}
      </div>
    </details>
  );
}
