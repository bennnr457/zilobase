import { getCalendarRealtimeWebSocketUrl } from "@zilobase/runtime-adapter/capabilities";
import { Hono } from "hono";
import { requireCalendarBinding } from "../../../services/calendar/connections/ownership";
import {
  CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX,
  CALENDAR_REALTIME_PROTOCOL,
  createCalendarRealtimeTicket,
} from "../../../services/calendar/realtime/calendar-realtime-ticket";
import { calendarWatchExpiry } from "../../../services/calendar/realtime/watch-health";
import { getStringEnv } from "../../../shared/config/config";
import type { AppBindings } from "../../../shared/contracts/http";
export const calendarRealtimeRoutes = new Hono<AppBindings>();
calendarRealtimeRoutes.post("/connections/:bindingId/realtime-ticket", async (c) => {
  const { account, binding } = await requireCalendarBinding(
    c.get("user")!.id,
    c.req.param("workspaceId")!,
    c.req.param("bindingId"),
  );
  const ticket = await createCalendarRealtimeTicket(
    {
      bindingId: binding.id,
      accountId: account.id,
      userId: binding.userId,
      workspaceId: binding.workspaceId,
    },
    c.env,
  );
  const url = new URL(getCalendarRealtimeWebSocketUrl(c.req.raw));
  url.searchParams.set("binding", binding.id);
  return c.json({
    ...ticket,
    providerWatchExpiresAt: getStringEnv(c.env, "CALENDAR_WEBHOOK_URL")
      ? await calendarWatchExpiry(account.id)
      : null,
    websocketUrl: url.toString(),
    websocketProtocols: [
      CALENDAR_REALTIME_PROTOCOL,
      `${CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX}${ticket.ticket}`,
    ],
  });
});
