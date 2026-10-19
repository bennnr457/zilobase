import { Hono } from "hono";
import { inspectCalendarConfiguration } from "../../../services/calendar/configuration";
import type { AppBindings } from "../../../shared/contracts/http";

export const calendarConfigurationRoutes = new Hono<AppBindings>();
calendarConfigurationRoutes.get("/configuration", (c) => {
  const ports = c.get("runtimePorts");
  return c.json(
    inspectCalendarConfiguration(c.env, {
      background: Boolean(ports?.jobs),
      realtime: Boolean(ports?.fanout),
    }),
  );
});
