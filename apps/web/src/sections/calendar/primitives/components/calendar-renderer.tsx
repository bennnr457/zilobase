import { ButtonGroup } from "@/components/ui/button-group";
import type { ReactNode } from "react";
import {
  EventCalendar,
  type EventCalendarProps,
} from "@/components/ui/event-calendar/event-calendar";
import { EventCalendarList } from "@/components/ui/event-calendar/event-calendar-list";
import { EventCalendarEvent } from "@/components/ui/event-calendar/event-calendar-event";
import { EventCalendarContent } from "@/components/ui/event-calendar/event-calendar-content";
import {
  EventCalendarNav,
  EventCalendarTitle,
  EventCalendarViewSwitcher,
  EventCalendarNavToday,
  EventCalendarNavPrev,
  EventCalendarNavNext,
} from "@/components/ui/event-calendar/event-calendar-nav";
import type { CalendarView } from "@/components/ui/event-calendar/event-calendar-types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const CALENDAR_VIEWS: CalendarView[] = ["month", "week", "day", "agenda"];

export type CalendarRendererProps<TData = unknown> = Omit<
  EventCalendarProps<TData>,
  "children" | "content"
> & {
  actions?: ReactNode;
  leading?: ReactNode;
  titleActions?: ReactNode;
  beforeContent?: ReactNode;
  content?: ReactNode;
};

/** Shared presentation only: each owner controls its own data, gestures, and navigation. */
export function CalendarRenderer<TData = unknown>({
  className,
  actions,
  leading,
  titleActions,
  beforeContent,
  content,
  ...props
}: CalendarRendererProps<TData>) {
  return (
    <EventCalendar<TData>
      views={CALENDAR_VIEWS}
      slotDuration={60}
      snapDuration={30}
      agendaDayCount={30}
      fixedWeeks
      showOutsideDays
      scrollbars="native"
      renderMoreContent={({ segments }) =>
        segments.length > 30 ? (
          <EventCalendarList
            rows={segments.map((segment) => ({ key: segment.occurrence.key, segment }))}
            renderRow={({ segment }) => (
              <EventCalendarEvent segment={segment} className="min-h-8 w-full" />
            )}
          />
        ) : undefined
      }
      className={cn("gap-0 border-0 bg-surface-canvas text-content-primary", className)}
      {...props}
    >
      <TooltipProvider delayDuration={600}>
        <EventCalendarNav className="min-h-10 flex-none flex-wrap gap-1 border-0 px-0 py-0">
          {leading}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <EventCalendarTitle className="min-w-0 truncate" />
            {titleActions}
          </div>
          <ButtonGroup variant="plain" aria-label="Calendar period navigation">
            <EventCalendarNavToday />
            <EventCalendarNavPrev />
            <EventCalendarNavNext />
          </ButtonGroup>
          <EventCalendarViewSwitcher />
          {actions}
        </EventCalendarNav>
      </TooltipProvider>
      {beforeContent}
      {content ?? <EventCalendarContent />}
    </EventCalendar>
  );
}
