import { Hono } from "hono";
import {
  getCalendarEventOperation,
  readCalendarCatalogOperation,
  readCalendarRangeOperation,
  searchCalendarOperation,
  syncCalendarOperation,
} from "../../../services/calendar/sync/application-operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { attachServiceErrorHandler } from "../../http/route-error";
export const calendarSyncRoutes = attachServiceErrorHandler(new Hono<AppBindings>());
calendarSyncRoutes.post("/connections/:bindingId/sync", async (c) =>
  c.json(
    await syncCalendarOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      bindingId: c.req.param("bindingId")!,
    }),
    200,
  ),
);
calendarSyncRoutes.get("/connections/:bindingId/ranges", async (c) =>
  c.json(
    await readCalendarRangeOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      bindingId: c.req.param("bindingId")!,
      query: c.req.query(),
      signal: c.req.raw.signal,
    }),
    200,
  ),
);
calendarSyncRoutes.get("/connections/:bindingId/search", async (c) =>
  c.json(
    await searchCalendarOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      bindingId: c.req.param("bindingId")!,
      query: c.req.query(),
      signal: c.req.raw.signal,
    }),
    200,
  ),
);
calendarSyncRoutes.get("/connections/:bindingId/calendars/:calendarId/events/:eventId", async (c) =>
  c.json(
    await getCalendarEventOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      bindingId: c.req.param("bindingId")!,
      calendarId: c.req.param("calendarId")!,
      eventId: c.req.param("eventId")!,
    }),
    200,
  ),
);

// Metadata-only cache reads must never trigger another provider sync.
calendarSyncRoutes.get("/connections/:bindingId/catalog", async (c) =>
  c.json(
    await readCalendarCatalogOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      bindingId: c.req.param("bindingId")!,
    }),
    200,
  ),
);
