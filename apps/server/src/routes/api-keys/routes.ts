import { Schema, SchemaTransformation } from "effect";
import type { Context } from "hono";
import { Hono } from "hono";
import {
  createOwnedApiKey,
  deleteOwnedApiKey,
  getOwnedApiKey,
  listOwnedApiKeys,
  readMetadata,
  toApiKeyPayload,
  updateOwnedApiKey,
} from "../../services/api-keys/lifecycle";

import { getMembership } from "../../services/access/principal-access";
import { readApiKeyWorkspaceId } from "../../services/api-keys/api-keys";
import type { AppBindings } from "../../shared/contracts/http";
import { parseJsonBody } from "../http/schema-json";

export const apiKeyRoutes = new Hono<AppBindings>();

const trimmedName = Schema.String.pipe(
  Schema.decode(SchemaTransformation.trim()),
  Schema.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
);

const CreateApiKey = Schema.Struct({
  expiresIn: Schema.optionalKey(Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0)))),
  name: trimmedName,
  workspaceId: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(Schema.isMinLength(1)),
  ),
});

const UpdateApiKey = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  name: Schema.optionalKey(trimmedName),
}).check(
  Schema.makeFilter((value) =>
    value.enabled !== undefined || value.name !== undefined
      ? undefined
      : "At least one field is required",
  ),
);

apiKeyRoutes.get("/", async (c) => {
  const auth = await requireSessionUser(c);

  if ("response" in auth) {
    return auth.response;
  }

  const workspaceId = c.req.query("workspaceId")?.trim();

  if (!workspaceId) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  if (!(await getMembership(workspaceId, auth.user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const rows = await listOwnedApiKeys(auth.user.id);

  return c.json({
    keys: rows
      .filter((row) => readApiKeyWorkspaceId(readMetadata(row.metadata)) === workspaceId)
      .map(toApiKeyPayload),
  });
});

apiKeyRoutes.post("/", async (c) => {
  const authContext = await requireSessionUser(c);

  if ("response" in authContext) {
    return authContext.response;
  }

  const parsed = await parseJsonBody(c.req, CreateApiKey);

  if (!parsed.ok) {
    return c.json(
      {
        error: "Invalid API key input",
        message: parsed.message || "Invalid API key input",
      },
      400,
    );
  }

  if (!(await getMembership(parsed.data.workspaceId, authContext.user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const key = await createOwnedApiKey(parsed.data, authContext.user.id, c.env, c.req.raw, {
    editionExtension: c.get("editionExtension") ?? undefined,
    policy: c.get("appPolicy"),
  });
  if ("error" in key) {
    return c.json(
      {
        error: "Invalid API key input",
        message: key.error,
      },
      400,
    );
  }

  return c.json({ key: { ...toApiKeyPayload(key), key: key.key } }, 201);
});

apiKeyRoutes.patch("/:id", async (c) => {
  const auth = await requireSessionUser(c);

  if ("response" in auth) {
    return auth.response;
  }

  const existing = await getOwnedApiKey(c.req.param("id"), auth.user.id);

  if (!existing) {
    return c.json({ error: "API key not found" }, 404);
  }

  const workspaceId = readApiKeyWorkspaceId(readMetadata(existing.metadata));

  if (!workspaceId || !(await getMembership(workspaceId, auth.user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const parsed = await parseJsonBody(c.req, UpdateApiKey);

  if (!parsed.ok) {
    return c.json(
      {
        error: "Invalid API key input",
        message: parsed.message || "Invalid API key input",
      },
      400,
    );
  }

  const updated = await updateOwnedApiKey(existing.id, auth.user.id, parsed.data);

  return c.json({ key: toApiKeyPayload(updated) });
});

apiKeyRoutes.delete("/:id", async (c) => {
  const auth = await requireSessionUser(c);

  if ("response" in auth) {
    return auth.response;
  }

  const existing = await getOwnedApiKey(c.req.param("id"), auth.user.id);

  if (!existing) {
    return c.json({ error: "API key not found" }, 404);
  }

  const workspaceId = readApiKeyWorkspaceId(readMetadata(existing.metadata));

  if (!workspaceId || !(await getMembership(workspaceId, auth.user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await deleteOwnedApiKey(existing.id, auth.user.id);

  return c.json({ deleted: true });
});

async function requireSessionUser(c: Context<AppBindings>) {
  const requestUser = c.get("user");

  if (!requestUser) {
    return { response: c.json({ error: "Unauthorized" }, 401) };
  }

  if (c.get("authMethod") === "apiKey") {
    return {
      response: c.json({ error: "API keys cannot manage API keys" }, 403),
    };
  }

  return { user: requestUser };
}
