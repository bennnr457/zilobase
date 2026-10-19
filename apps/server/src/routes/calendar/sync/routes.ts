import { Hono } from "hono";
import { requireCalendarBinding } from "../../../services/calendar/connections/ownership";
import { normalizeEvent } from "../../../services/calendar/provider/gateway";
import { createCalendarGateway } from "../../../services/calendar/provider/oauth";
import {
  readOwnedCalendarRange,
  searchOwnedCalendar,
  syncCalendarConnection,
} from "../../../services/calendar/sync/operations";
import { readProviderCalendarStates } from "../../../services/calendar/sync/provider-state";
import { calendarRangeSchema } from "../../../services/calendar/sync/ranges";
import { calendarSearchSchema } from "../../../services/calendar/sync/search";
import type { AppBindings } from "../../../shared/contracts/http";
export const calendarSyncRoutes = new Hono<AppBindings>();
calendarSyncRoutes.post("/connections/:bindingId/sync", async (c) => {
  const { account, binding } = await requireCalendarBinding(
    c.get("user")!.id,
    c.req.param("workspaceId")!,
    c.req.param("bindingId"),
  );
  return c.json(await syncCalendarConnection(account, binding, c.env));
});
calendarSyncRoutes.get("/connections/:bindingId/ranges", async (c) => {
  const { account, binding } = await requireCalendarBinding(
    c.get("user")!.id,
    c.req.param("workspaceId")!,
    c.req.param("bindingId"),
  );
  const range = calendarRangeSchema.parse(c.req.query());
  return c.json(await readOwnedCalendarRange(account, binding, range, c.env, c.req.raw.signal));
});
calendarSyncRoutes.get("/connections/:bindingId/search", async (c) => {
  const { account, binding } = await requireCalendarBinding(
    c.get("user")!.id,
    c.req.param("workspaceId")!,
    c.req.param("bindingId"),
  );
  const input = calendarSearchSchema.parse(c.req.query());
  return c.json(await searchOwnedCalendar(account, binding, input, c.env, c.req.raw.signal));
});
calendarSyncRoutes.get(
  "/connections/:bindingId/calendars/:calendarId/events/:eventId",
  async (c) => {
    const { account, binding } = await requireCalendarBinding(
      c.get("user")!.id,
      c.req.param("workspaceId")!,
      c.req.param("bindingId"),
    );
    const gateway = await createCalendarGateway(c.env, account),
      calendarId = c.req.param("calendarId");
    const raw = await gateway.request(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(c.req.param("eventId"))}`,
    );
    return c.json({
      event: normalizeEvent(
        raw,
        { workspaceId: binding.workspaceId, bindingId: binding.id, calendarId },
        "UTC",
      ),
    });
  },
);

// Metadata-only cache reads must never trigger another provider sync.
calendarSyncRoutes.get("/connections/:bindingId/catalog", async (c) => {
  const { account, binding } = await requireCalendarBinding(
    c.get("user")!.id,
    c.req.param("workspaceId")!,
    c.req.param("bindingId"),
  );
  const states = await readProviderCalendarStates(account.id);
  return c.json({ calendars: states.map((state) => ({ ...state.data, bindingId: binding.id })) });
});
