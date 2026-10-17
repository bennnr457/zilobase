import { chromeCalendarDate } from "../../workspace/hooks/calendar-navigation";
import { useCalendarWorkspace } from "../../workspace/components/calendar-workspace";
import { useCalendarDisplayPreferences } from "../../preferences/components/calendar-travel";
import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { todayInZone, type CalendarPreferences } from "@zilobase/features/calendar";
import { DateCalendar } from "@/components/ui/calendar";

export function CalendarMiniCalendar({
  preferences: savedPreferences,
}: {
  preferences: CalendarPreferences;
}) {
  const workspace = useCalendarWorkspace();
  const preferences = useCalendarDisplayPreferences(savedPreferences);
  const search = useSearch({ strict: false }) as {
    align?: boolean;
    days?: number;
    date?: string;
    view?: CalendarPreferences["view"];
  };
  const navigate = useNavigate();
  const route = (search: import("../../workspace/hooks/calendar-navigation").CalendarDestination) =>
    workspace.navigateCalendar(search, () => {
      void navigate({ to: "/calendar", search });
    });
  const date = chromeCalendarDate(workspace.visibleDate, search.date, preferences.timeZone);
  const selected = new Date(`${date}T12:00:00`);
  const [month, setMonth] = useState(selected);
  useEffect(() => setMonth(new Date(`${date}T12:00:00`)), [date]);
  return (
    <div aria-label="Choose calendar date" onKeyDown={(event) => event.stopPropagation()}>
      <DateCalendar
        className="w-full bg-transparent"
        mode="single"
        month={month}
        onMonthChange={setMonth}
        selected={selected}
        today={new Date(`${todayInZone(preferences.timeZone)}T12:00:00`)}
        weekStartsOn={preferences.weekStartsOn}
        showOutsideDays
        fixedWeeks
        onSelect={(day) => {
          if (day)
            route({
              view: search.view ?? preferences.view,
              date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
            });
        }}
      />
    </div>
  );
}
