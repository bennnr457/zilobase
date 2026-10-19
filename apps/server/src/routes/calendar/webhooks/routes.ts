import { Hono } from "hono";
import { receiveCalendarWebhook } from "../../../services/calendar/provider/callbacks";
import type { AppBindings } from "../../../shared/contracts/http";

export const calendarWebhookRoutes = new Hono<AppBindings>();
calendarWebhookRoutes.post("/google/webhook", async (c) => {
  const accepted = await receiveCalendarWebhook(c.env, c.req.raw.headers);
  return c.body(null, accepted ? 204 : 403);
});
