import { Hono } from "hono";
import {
  getCalendarPreferencesOperation,
  saveCalendarPreferencesOperation,
} from "../../../services/calendar/preferences/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { attachServiceErrorHandler } from "../../http/route-error";

export const calendarPreferenceRoutes = attachServiceErrorHandler(new Hono<AppBindings>());
calendarPreferenceRoutes.get("/preferences", async (c) =>
  c.json(
    await getCalendarPreferencesOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);
calendarPreferenceRoutes.put("/preferences", async (c) =>
  c.json(
    await saveCalendarPreferencesOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")! },
      () => c.req.json(),
    ),
    200,
  ),
);
