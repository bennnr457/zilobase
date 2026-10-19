import { Schema } from "effect";
import { Hono } from "hono";
import { personalCalendarSources } from "../../../services/calendar/connections/catalog";
import {
  disconnectOwnedCalendar,
  listCalendarConnections,
} from "../../../services/calendar/connections/connections";
import { requireCalendarBinding } from "../../../services/calendar/connections/ownership";
import {
  beginCalendarOAuth,
  createCalendarGateway,
} from "../../../services/calendar/provider/oauth";
import { getStringEnv } from "../../../shared/config/config";
import type { AppBindings } from "../../../shared/contracts/http";

export const calendarConnectionRoutes = new Hono<AppBindings>();
const GoogleOAuthStart = Schema.Struct({
  client: Schema.Literals(["web", "desktop"]),
});

calendarConnectionRoutes.get("/connections", async (c) => {
  return c.json(
    await listCalendarConnections(c.get("user")!.id, c.req.param("workspaceId")!, c.env),
  );
});
calendarConnectionRoutes.get("/sources", async (c) =>
  c.json({
    connections: await personalCalendarSources(c.get("user")!.id, c.req.param("workspaceId")!),
    providerConfigured: Boolean(
      getStringEnv(c.env, "CALENDAR_GOOGLE_CLIENT_ID") &&
      getStringEnv(c.env, "CALENDAR_GOOGLE_CLIENT_SECRET") &&
      getStringEnv(c.env, "CALENDAR_TOKEN_ENCRYPTION_KEY"),
    ),
  }),
);
calendarConnectionRoutes.post("/connections/google/start", async (c) => {
  const body = Schema.decodeUnknownSync(GoogleOAuthStart)(await c.req.json());
  return c.json({
    authorizationUrl: await beginCalendarOAuth(c.env, {
      userId: c.get("user")!.id,
      workspaceId: c.req.param("workspaceId")!,
      clientKind: body.client,
    }),
  });
});
calendarConnectionRoutes.delete("/connections/:bindingId", async (c) => {
  const owned = await requireCalendarBinding(
    c.get("user")!.id,
    c.req.param("workspaceId")!,
    c.req.param("bindingId"),
  );
  await disconnectOwnedCalendar(
    owned,
    c.get("user")!.id,
    c.req.param("workspaceId")!,
    c.req.param("bindingId"),
    c.env,
  );

  return c.json({ disconnected: true });
});
calendarConnectionRoutes.get("/connections/:bindingId/calendars", async (c) => {
  const row = await requireCalendarBinding(
    c.get("user")!.id,
    c.req.param("workspaceId")!,
    c.req.param("bindingId"),
  );
  return c.json({
    calendars: await (await createCalendarGateway(c.env, row.account)).calendars(row.binding.id),
  });
});
