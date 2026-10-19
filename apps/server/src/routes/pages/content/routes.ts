import { Hono } from "hono";
import { preparePageCollaboration } from "../../../services/pages/content/collaboration-bootstrap";
import { replacePageBody, updatePage } from "../../../services/pages/content/update-page";
import { updatePageProperty } from "../../../services/pages/properties/update-value";
import { attachServiceErrorHandler } from "../../http/route-error";
import { authorizePageRoute } from "../access";

import { getCollaborationWebSocketUrl } from "@zilobase/runtime-adapter/capabilities";
import { getWorkspacePrincipalKind } from "../../../services/access/principal-access";
import type { AppBindings } from "../../../shared/contracts/http";
import { readJsonBody } from "../../http/request";

import { getPagePropertyPayload } from "../../../services/pages/properties/property-payload";

export const pageContentRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

pageContentRoutes.get("/:id/properties", async (c) => {
  const authorization = await authorizePageRoute(c, "view");
  if (!authorization.ok) return authorization.response;
  const { user, record } = authorization;

  return c.json({
    ...(await getPagePropertyPayload(record.id, record.workspaceId, user.id)),
    viewerType: (await getWorkspacePrincipalKind(record.workspaceId, user.id)) ?? "guest",
  });
});

pageContentRoutes.put("/:id/properties/:propertyId/value", async (c) => {
  const authorization = await authorizePageRoute(c, "edit");
  if (!authorization.ok) return authorization.response;
  const { user, record } = authorization;

  const body = await readJsonBody(c.req);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const propertyId = c.req.param("propertyId");
  const { value = null } = body as { value?: unknown };
  return c.json(
    await updatePageProperty(
      record,
      user,
      propertyId,
      value,
      c.env,
      c.get("authMethod") === "apiKey",
    ),
  );
});

pageContentRoutes.post("/:id/collaboration-bootstrap", async (c) => {
  const authorization = await authorizePageRoute(c, "view");
  if (!authorization.ok) return authorization.response;
  const { user, record: existing, accessLevel } = authorization;

  const body = await readJsonBody(c.req);
  if (
    !body ||
    typeof body !== "object" ||
    !("includeState" in body) ||
    typeof body.includeState !== "boolean"
  ) {
    return c.json({ error: "includeState must be a boolean" }, 400);
  }

  const bootstrap = await preparePageCollaboration(
    existing,
    user,
    accessLevel,
    body.includeState,
    c.env,
  );
  const { documentName } = bootstrap;
  const websocketUrl = new URL(getCollaborationWebSocketUrl(c.req.raw));
  websocketUrl.searchParams.set("document", documentName);

  c.header("Cache-Control", "no-store");
  return c.json({
    ...bootstrap,
    websocketUrl: websocketUrl.toString(),
  });
});

pageContentRoutes.patch("/:id/content", async (c) => {
  const authorization = await authorizePageRoute(c, "edit");
  if (!authorization.ok) return authorization.response;
  const { user, record: existing } = authorization;

  const body = await readJsonBody(c.req);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { content, baseUpdatedAt } = body as {
    baseUpdatedAt?: unknown;
    content?: unknown;
  };

  if (!("content" in body)) {
    return c.json({ error: "content is required" }, 400);
  }

  let baseRevision: Date | undefined;
  if (baseUpdatedAt !== undefined) {
    if (typeof baseUpdatedAt !== "string")
      return c.json({ error: "baseUpdatedAt must be a string" }, 400);
    baseRevision = new Date(baseUpdatedAt);
    if (Number.isNaN(baseRevision.getTime()))
      return c.json({ error: "baseUpdatedAt must be a valid date" }, 400);
  }
  const result = await replacePageBody(existing, user, content, c.env, baseRevision);
  if ("conflict" in result)
    return c.json(
      { error: "Page content was updated by another request.", page: result.conflict },
      409,
    );
  return c.json({ page: result.page });
});

pageContentRoutes.patch("/:id", async (c) => {
  const authorization = await authorizePageRoute(c, "edit");
  if (!authorization.ok) return authorization.response;
  const { user, record: existing } = authorization;

  const body = await readJsonBody(c.req);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const patch = body as {
    type?: unknown;
    name?: unknown;
    url?: unknown;
    content?: unknown;
    metadata?: unknown;
  };
  return c.json(await updatePage(existing, user, patch, c.env, c.get("authMethod") === "apiKey"));
});
