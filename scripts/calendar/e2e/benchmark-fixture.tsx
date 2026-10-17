import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarRenderer } from "@/sections/calendar/primitives/components/calendar-renderer";
import type {
  CalendarEvent,
  CalendarView,
} from "@/components/ui/event-calendar/event-calendar-types";
import "@/styles/global.css";
import "@/styles/app.css";
const count = Number(new URLSearchParams(location.search).get("count") ?? 10000);
const items: CalendarEvent[] = Array.from({ length: count }, (_, i) => ({
  id: `event-${i}`,
  title: `Meeting ${i}`,
  start: new Date(Date.UTC(2026, 8, (i % 28) + 1, 3 + (Math.floor(i / 28) % 14))),
  end: new Date(Date.UTC(2026, 8, (i % 28) + 1, 4 + (Math.floor(i / 28) % 14))),
}));
const metrics = { cards: 0 };
function Fixture() {
  const [view, setView] = useState<CalendarView>("month"),
    [revision, setRevision] = useState(0);
  const render = useCallback(({ occurrence }: { occurrence: { event: CalendarEvent } }) => {
    metrics.cards++;
    return <span data-calendar-event-card>{occurrence.event.title}</span>;
  }, []);
  Object.assign(window, {
    surfaceFixture: {
      navigate: (view: CalendarView) => setView(view),
      reset: () => {
        metrics.cards = 0;
      },
      refresh: () => setRevision((r) => r + 1),
      metrics,
    },
  });
  return (
    <main className="flex h-screen flex-col">
      <output>
        {view} {revision}
      </output>
      <CalendarRenderer
        className="min-h-0 flex-1"
        defaultDate={new Date("2026-09-09T00:00:00+05:30")}
        view={view}
        onViewChange={setView}
        events={items}
        timeZone="Asia/Kolkata"
        weekStartsOn={1}
        maxEventsPerCell={3}
        scrollMode="contained"
        renderEvent={render}
        renderAgendaEvent={render}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
