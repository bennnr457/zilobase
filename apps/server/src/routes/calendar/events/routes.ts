import { Hono } from "hono";
import {
  createCalendarEventOperation,
  mutateCalendarEventOperation,
  reconcileCalendarEventOperation,
} from "../../../services/calendar/events/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { attachServiceErrorHandler } from "../../http/route-error";

export const calendarEventRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

calendarEventRoutes.post("/connections/:bindingId/calendars/:calendarId/events", async (c) => {
  const result = await createCalendarEventOperation(
    serverOperationContext(c),
    {
      workspaceId: c.req.param("workspaceId")!,
      bindingId: c.req.param("bindingId")!,
      calendarId: c.req.param("calendarId")!,
    },
    () => c.req.json(),
  );
  return c.json(result, result.status === "succeeded" ? 200 : 202);
});

calendarEventRoutes.post(
  "/connections/:bindingId/calendars/:calendarId/events/:eventId/:action",
  async (c) => {
    const result = await mutateCalendarEventOperation(
      serverOperationContext(c),
      {
        action: c.req.param("action")!,
        workspaceId: c.req.param("workspaceId")!,
        bindingId: c.req.param("bindingId")!,
        calendarId: c.req.param("calendarId")!,
        eventId: c.req.param("eventId")!,
      },
      () => c.req.json(),
    );
    return c.json(result, result.status === "succeeded" ? 200 : 202);
  },
);

calendarEventRoutes.get("/operations/:operationId", async (c) =>
  c.json(
    await reconcileCalendarEventOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      operationId: c.req.param("operationId")!,
    }),
    200,
  ),
);
