import { Hono } from "hono";
import {
  connectCalendarOperation,
  disconnectCalendarOperation,
  listCalendarConnectionsOperation,
  listCalendarSourcesOperation,
  listProviderCalendarsOperation,
} from "../../../services/calendar/connections/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { attachServiceErrorHandler } from "../../http/route-error";

export const calendarConnectionRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

calendarConnectionRoutes.get("/connections", async (c) =>
  c.json(
    await listCalendarConnectionsOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);
calendarConnectionRoutes.get("/sources", async (c) =>
  c.json(
    await listCalendarSourcesOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);
calendarConnectionRoutes.post("/connections/google/start", async (c) =>
  c.json(
    await connectCalendarOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")! },
      () => c.req.json(),
    ),
    200,
  ),
);
calendarConnectionRoutes.delete("/connections/:bindingId", async (c) =>
  c.json(
    await disconnectCalendarOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      bindingId: c.req.param("bindingId")!,
    }),
    200,
  ),
);
calendarConnectionRoutes.get("/connections/:bindingId/calendars", async (c) =>
  c.json(
    await listProviderCalendarsOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      bindingId: c.req.param("bindingId")!,
    }),
    200,
  ),
);
