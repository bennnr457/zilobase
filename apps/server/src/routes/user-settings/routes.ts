import { Schema, SchemaTransformation } from "effect";
import { Hono } from "hono";
import {
  getOrCreateUserSettings,
  updateUserPreferences,
} from "../../services/user-settings/preferences/preferences";
import { updateUserProfile } from "../../services/user-settings/profile/profile";
import type { AppBindings } from "../../shared/contracts/http";
import { readJsonBody } from "../http/request";
import { parseJsonBody, parseUnknown } from "../http/schema-json";

export const pageSettingsRoutes = new Hono<AppBindings>();

const UpdateProfile = Schema.Struct({
  email: Schema.optionalKey(
    Schema.String.pipe(
      Schema.decode(SchemaTransformation.trim()),
      Schema.decode(SchemaTransformation.toLowerCase()),
      Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
    ),
  ),
  name: Schema.optionalKey(
    Schema.String.pipe(
      Schema.decode(SchemaTransformation.trim()),
      Schema.check(
        Schema.isMinLength(1, { message: "Name is required." }),
        Schema.isMaxLength(120),
      ),
    ),
  ),
}).check(
  Schema.makeFilter((value) =>
    value.name !== undefined || value.email !== undefined
      ? undefined
      : "Provide at least one field to update.",
  ),
);

const UpdateUserSettings = Schema.Struct({
  embeddedItemsOpenAs: Schema.optionalKey(Schema.Literals(["dialog", "sidepanel"])),
  pageFullWidth: Schema.optionalKey(Schema.Boolean),
  sidebarConfig: Schema.optionalKey(
    Schema.Unknown.check(
      Schema.makeFilter((value) =>
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? undefined
          : "sidebarConfig must be an object",
      ),
    ),
  ),
});

pageSettingsRoutes.get("/", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json({ settings: await getOrCreateUserSettings(user.id) });
});

pageSettingsRoutes.patch("/", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const parsed = await parseUnknown(UpdateUserSettings, body);
  if (!parsed.ok) {
    return c.json({ error: parsed.message }, 400);
  }

  return c.json({ settings: await updateUserPreferences(user.id, parsed.data) });
});

pageSettingsRoutes.patch("/profile", async (c) => {
  const currentUser = c.get("user");

  if (!currentUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const parsed = await parseJsonBody(c.req, UpdateProfile);

  if (!parsed.ok) {
    return c.json({ error: parsed.message || "Invalid request." }, 400);
  }

  const result = await updateUserProfile(currentUser, parsed.data);
  if ("conflict" in result) return c.json({ error: "That email address is already in use." }, 409);
  return c.json(result);
});
