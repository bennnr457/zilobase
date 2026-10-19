import { Schema } from "effect";
import { Hono } from "hono";
import {
  canEditScope,
  canViewTarget,
  deletePageLayout,
  getTargetContext,
  resolvePageLayouts,
  resolveScopeContext,
  savePageLayout,
} from "../../../services/pages/layouts/page-layouts";

import type { AppBindings } from "../../../shared/contracts/http";
import { parseJsonBody, parseUnknown } from "../../http/schema-json";

export const pageLayoutRoutes = new Hono<AppBindings>();

const PageLayoutScopeSchema = Schema.Literals(["workspace", "database", "page"]);
const SavePageLayout = Schema.Struct({
  clearPageOverrides: Schema.optionalKey(Schema.Boolean),
  config: Schema.Unknown,
});

pageLayoutRoutes.get("/resolve", async (c) => {
  const pageId = c.req.query("pageId")?.trim() || null;
  const databaseId = c.req.query("databaseId")?.trim() || null;
  const context = await getTargetContext({ pageId, databaseId });

  if (!context) return c.json({ error: "Page or database not found." }, 404);
  if (!(await canViewTarget(context, c.get("user")?.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json(await resolvePageLayouts(context));
});

pageLayoutRoutes.put("/:scope/:scopeId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const scopeResult = await parseUnknown(PageLayoutScopeSchema, c.req.param("scope"));
  const bodyResult = await parseJsonBody(c.req, SavePageLayout);
  if (!scopeResult.ok || !bodyResult.ok) return c.json({ error: "Invalid layout." }, 400);

  const scope = scopeResult.data;
  const scopeId = c.req.param("scopeId");
  const context = await resolveScopeContext(scope, scopeId);
  if (!context) return c.json({ error: "Layout target not found." }, 404);
  if (!(await canEditScope(scope, scopeId, context.workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json(await savePageLayout(scope, scopeId, context, bodyResult.data));
});

pageLayoutRoutes.delete("/:scope/:scopeId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const scopeResult = await parseUnknown(PageLayoutScopeSchema, c.req.param("scope"));
  if (!scopeResult.ok) return c.json({ error: "Invalid scope." }, 400);
  const scope = scopeResult.data;
  const scopeId = c.req.param("scopeId");
  const context = await resolveScopeContext(scope, scopeId);
  if (!context) return c.json({ error: "Layout target not found." }, 404);
  if (!(await canEditScope(scope, scopeId, context.workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await deletePageLayout(scope, scopeId);
  return c.json({ ok: true });
});
