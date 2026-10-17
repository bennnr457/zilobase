import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarRenderer } from "@/sections/calendar/primitives/components/calendar-renderer";
import type {
  CalendarEvent,
  CalendarView,
} from "@/components/ui/event-calendar/event-calendar-types";
import "@/styles/global.css";
import "@/styles/app.css";
const sample: CalendarEvent[] = [
  {
    id: "meeting",
    title: "Plain meeting",
    start: new Date("2026-09-09T04:30:00Z"),
    end: new Date("2026-09-09T05:30:00Z"),
  },
  {
    id: "holiday",
    title: "Plain holiday",
    start: new Date("2026-09-08T18:30:00Z"),
    end: new Date("2026-09-10T18:30:00Z"),
    allDay: true,
  },
  {
    id: "readonly",
    title: "Read only",
    start: new Date("2026-09-07T18:30:00Z"),
    end: new Date("2026-09-08T18:30:00Z"),
    allDay: true,
    readOnly: true,
  },
];
function Fixture({ name }: { name: string }) {
  const [date, setDate] = useState(new Date("2026-09-09T00:00:00+05:30"));
  const [view, setView] = useState<CalendarView>("week");
  const [items, setItems] = useState(sample),
    [action, setAction] = useState("");
  const [density, setDensity] = useState(48),
    [zone, setZone] = useState("Asia/Kolkata"),
    [weekends, setWeekends] = useState(true);
  return (
    <section
      aria-label={name}
      className="flex h-screen min-w-0 flex-1 flex-col bg-surface-canvas text-content-primary"
    >
      <nav>
        <button onClick={() => setDensity(density === 48 ? 96 : 48)}>Toggle density</button>
        <button onClick={() => setZone(zone === "UTC" ? "Asia/Kolkata" : "UTC")}>
          Toggle timezone
        </button>
        <button onClick={() => setWeekends(!weekends)}>Toggle weekends</button>
      </nav>
      <output>
        {date.toISOString()} {action}
      </output>
      <CalendarRenderer
        className="min-h-0 flex-1"
        events={items}
        date={date}
        view={view}
        onDateChange={setDate}
        onViewChange={setView}
        timeZone={zone}
        hourHeight={density}
        viewSettings={{ weekends }}
        scrollMode="contained"
        showDayAddButton
        onEventClick={({ eventId }) => setAction(`selected:${eventId}`)}
        onSlotClick={(slot) => setAction(`created:${slot.date.toISOString()}:${slot.allDay}`)}
        onSelectSlot={(slot) =>
          setAction(`range:${slot.start.toISOString()}:${slot.end.toISOString()}`)
        }
        onEventUpdate={(update) => {
          setItems((items) =>
            items.map((item) =>
              item.id === update.event.id
                ? { ...item, start: update.start, end: update.end, allDay: update.allDay }
                : item,
            ),
          );
          setAction(`changed:${update.event.id}`);
          return true;
        }}
        renderEvent={({ occurrence }) => (
          <span data-calendar-event-card>{occurrence.event.title}</span>
        )}
      />
    </section>
  );
}
const root = createRoot(document.getElementById("root")!);
let mount = 0;
const render = () =>
  root.render(
    <main className="flex" key={++mount}>
      <Fixture name="First calendar" />
      <Fixture name="Second calendar" />
    </main>,
  );
Object.assign(window, { calendarSurface: { remount: render } });
render();
