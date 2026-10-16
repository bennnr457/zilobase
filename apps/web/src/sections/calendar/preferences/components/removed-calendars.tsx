import { useCalendarAccounts } from "../../connections/hooks/use-calendar-accounts";
import { useCalendarCatalog } from "@zilobase/features/calendar/react";
import { calendarSelectionKey } from "@zilobase/features/calendar";
import { useCalendarPreferences } from "../hooks/use-calendar-preferences";
import { Button } from "@/components/ui/button";
import {
  SettingsRow,
  SettingsSection as SettingsSectionLayout,
} from "@/sections/settings/shell/components/settings-layout";
export function RemovedCalendars({ workspaceId }: { workspaceId: string }) {
  const { accounts } = useCalendarAccounts(workspaceId),
    preferences = useCalendarPreferences(workspaceId);
  const catalog = useCalendarCatalog(accounts.data?.connections ?? []),
    value = preferences.query.data;
  const removed = catalog.calendars.filter((calendar) =>
    value?.removedCalendarKeys?.includes(calendarSelectionKey(calendar.bindingId, calendar.id)),
  );
  if (!value || !removed.length) return null;
  return (
    <SettingsSectionLayout
      className="border-t border-stroke-default pt-6"
      description="Restore calendars that were removed from your visible calendar list."
      title="Removed calendars"
    >
      {removed.map((calendar) => {
        const key = calendarSelectionKey(calendar.bindingId, calendar.id);
        return (
          <SettingsRow
            action={
              <Button
                size="sm"
                variant="outline"
                disabled={preferences.pending}
                onClick={() =>
                  preferences.save.mutate({
                    ...value,
                    removedCalendarKeys: value.removedCalendarKeys?.filter((id) => id !== key),
                    hiddenCalendarKeys: value.hiddenCalendarKeys.filter((id) => id !== key),
                  })
                }
              >
                Restore
              </Button>
            }
            description={
              accounts.data?.connections.find((account) => account.bindingId === calendar.bindingId)
                ?.email
            }
            key={key}
            title={calendar.name}
          />
        );
      })}
    </SettingsSectionLayout>
  );
}
