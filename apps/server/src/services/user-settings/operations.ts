import { Schema, SchemaTransformation } from "effect";
import { parseOperationBody, parseUnknown } from "../../shared/validation";
import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { getOrCreateUserSettings, updateUserPreferences } from "./preferences/preferences";
import { updateUserProfile } from "./profile/profile";
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
export type GetUserSettingsOperationInput = {};
export async function getUserSettingsOperation(
  context: ServerOperationContext,
  operationInput: GetUserSettingsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });

  const user = context.authentication.user;
  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }
  return { settings: await getOrCreateUserSettings(user.id) };
}

export type UpdateUserSettingsOperationInput = { body?: unknown };
export async function updateUserSettingsOperation(
  context: ServerOperationContext,
  operationInput: UpdateUserSettingsOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const user = context.authentication.user;
  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const body = await readBody().catch(() => null);
  if (!body || typeof body !== "object") {
    return deny({ error: "A JSON body is required" }, 400);
  }
  const parsed = await parseUnknown(UpdateUserSettings, body);
  if (!parsed.ok) {
    return deny({ error: parsed.message }, 400);
  }
  return { settings: await updateUserPreferences(user.id, parsed.data) };
}

export type UpdateUserProfileOperationInput = { body?: unknown };
export async function updateUserProfileOperation(
  context: ServerOperationContext,
  operationInput: UpdateUserProfileOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });

  const currentUser = context.authentication.user;
  if (!currentUser) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const parsed = await parseOperationBody(UpdateProfile, readBody);
  if (!parsed.ok) {
    return deny({ error: parsed.message || "Invalid request." }, 400);
  }
  const result = await updateUserProfile(currentUser, parsed.data);
  if ("conflict" in result) return deny({ error: "That email address is already in use." }, 409);
  return result;
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
