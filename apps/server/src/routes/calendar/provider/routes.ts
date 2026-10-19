import { Hono } from "hono";
import {
  cancelCalendarConnection,
  completeCalendarConnection,
} from "../../../services/calendar/provider/callbacks";
import type { AppBindings } from "../../../shared/contracts/http";
import { finishCalendarConnection } from "./connection-response";

export const calendarCallbackRoutes = new Hono<AppBindings>();
calendarCallbackRoutes.get("/oauth/google/callback", async (c) => {
  const state = c.req.query("state");
  if (!state) return c.json({ message: "Missing OAuth state." }, 400);
  if (c.req.query("error")) {
    const attempt = await cancelCalendarConnection(c.env, state);
    return finishCalendarConnection(c, attempt, "cancelled");
  }
  const code = c.req.query("code");
  if (!code) return c.json({ message: "Missing OAuth code." }, 400);
  const result = await completeCalendarConnection(c.env, state, code);
  return finishCalendarConnection(c, result, "success");
});
