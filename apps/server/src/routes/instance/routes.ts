import { Schema, SchemaTransformation } from "effect";
import { Hono } from "hono";
import {
  getInstanceSettingsOperation,
  updateInstanceSettingsOperation,
} from "../../services/instance/operations";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

import { getZilobaseDiscoveryDocument } from "../../services/instance/discovery/discovery";
import {
  BootstrapAlreadyCompletedError,
  bootstrapSelfHostedInstance,
  BootstrapStateConflictError,
  InvalidBootstrapTokenError,
} from "../../services/instance/registration/registration";
import { isCommunityRegistration } from "../../shared/config/app-policy";
import type { AppBindings } from "../../shared/contracts/http";
import { parseJsonBody } from "../http/schema-json";

export const instanceRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

const BootstrapInput = Schema.Struct({
  email: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(
      Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
        message: "Invalid email",
      }),
      Schema.isMaxLength(320),
    ),
  ),
  name: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(Schema.isMinLength(1, { message: "Name is required." }), Schema.isMaxLength(100)),
  ),
  password: Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(8, { message: "Password must be at least 8 characters." }),
      Schema.isMaxLength(128),
    ),
  ),
  workspaceName: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(
      Schema.isMinLength(1, { message: "Workspace name is required." }),
      Schema.isMaxLength(120),
    ),
  ),
});

instanceRoutes.get("/.well-known/zilobase", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(
    await getZilobaseDiscoveryDocument(c.env, undefined, {
      editionExtension: c.get("editionExtension") ?? undefined,
    }),
  );
});

instanceRoutes.post("/api/instance/bootstrap", async (c) => {
  if (!isCommunityRegistration(c.get("appPolicy"))) {
    return c.json({ error: "Not found" }, 404);
  }

  const parsed = await parseJsonBody(c.req, BootstrapInput);

  if (!parsed.ok) {
    return c.json({ error: parsed.message || "Invalid bootstrap request." }, 400);
  }

  try {
    const result = await bootstrapSelfHostedInstance(
      c.env,
      readBootstrapToken(c.req.raw.headers),
      parsed.data,
      undefined,
      { editionExtension: c.get("editionExtension") ?? undefined },
    );
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof InvalidBootstrapTokenError) {
      return c.json({ error: error.message }, 401);
    }

    if (
      error instanceof BootstrapAlreadyCompletedError ||
      error instanceof BootstrapStateConflictError
    ) {
      return c.json({ error: error.message }, 409);
    }

    throw error;
  }
});

instanceRoutes.get("/api/instance/settings", async (c) =>
  c.json(await getInstanceSettingsOperation(serverOperationContext(c), {}), 200),
);

instanceRoutes.patch("/api/instance/settings", async (c) =>
  c.json(
    await updateInstanceSettingsOperation(serverOperationContext(c), {}, () => c.req.json()),
    200,
  ),
);

function readBootstrapToken(headers: Headers) {
  const explicitToken = headers.get("x-zilobase-bootstrap-token")?.trim();

  if (explicitToken) {
    return explicitToken;
  }

  const authorization = headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}
