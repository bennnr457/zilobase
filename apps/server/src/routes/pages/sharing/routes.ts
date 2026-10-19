import { Hono } from "hono";
import {
  getPageAccessRules,
  getPageAccessTargets,
  grantPageAccess,
  removePageAccessRule,
  removePublicPageAccess,
} from "../../../services/pages/sharing/page-sharing";
import { attachServiceErrorHandler } from "../../http/route-error";
import { authorizePageRoute } from "../access";

import { normalizeAccessLevel } from "../../../services/access/access-level";
import type { AppBindings } from "../../../shared/contracts/http";
import { readJsonBody } from "../../http/request";

export const pageSharingRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

pageSharingRoutes.get("/:id/access", async (c) => {
  const authorization = await authorizePageRoute(c, "full");
  if (!authorization.ok) return authorization.response;
  const { user: requestUser, record, accessLevel } = authorization;

  const rules = await getPageAccessRules(record.id);
  return c.json({ access: rules });
});

pageSharingRoutes.get("/:id/access-targets", async (c) => {
  const authorization = await authorizePageRoute(c, "view");
  if (!authorization.ok) return authorization.response;
  const { user: requestUser, record, accessLevel: requestUserAccess } = authorization;

  return c.json(await getPageAccessTargets(record));
});

pageSharingRoutes.put("/:id/access", async (c) => {
  const authorization = await authorizePageRoute(c, "full");
  if (!authorization.ok) return authorization.response;
  const { record } = authorization;

  const body = await readJsonBody(c.req);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const { targetType, targetId, accessLevel } = body as {
    accessLevel?: unknown;
    targetId?: unknown;
    targetType?: unknown;
  };
  const normalizedAccessLevel = normalizeAccessLevel(accessLevel);

  if (!isPageAccessTarget(targetType)) {
    return c.json({ error: "targetType must be public, user, or team" }, 400);
  }

  if (typeof targetId !== "string" || targetId.length === 0) {
    return c.json({ error: "targetId is required" }, 400);
  }

  if (!normalizedAccessLevel) {
    return c.json({ error: "accessLevel must be view, comment, edit, or full" }, 400);
  }

  return c.json(await grantPageAccess(record, targetType, targetId, normalizedAccessLevel));
});

function isPageAccessTarget(value: unknown): value is "public" | "user" | "team" {
  return typeof value === "string" && ["public", "user", "team"].includes(value);
}

pageSharingRoutes.delete("/:id/access/public", async (c) => {
  const authorization = await authorizePageRoute(c, "full");
  if (!authorization.ok) return authorization.response;
  const { user: requestUser, record, accessLevel } = authorization;

  const rule = await removePublicPageAccess(record.id);
  return c.json({ access: rule ?? null });
});

pageSharingRoutes.delete("/:id/access/:ruleId", async (c) => {
  const authorization = await authorizePageRoute(c, "full");
  if (!authorization.ok) return authorization.response;
  const { user: requestUser, record, accessLevel } = authorization;

  const rule = await removePageAccessRule(record.id, c.req.param("ruleId"));
  if (!rule) {
    return c.json({ error: "Access rule not found" }, 404);
  }

  return c.json({ access: rule });
});
