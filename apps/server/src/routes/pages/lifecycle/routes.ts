import { Hono } from "hono";
import { canAccessPageInWorkspace } from "../../../services/access/effective-access";
import { getMembership } from "../../../services/access/principal-access";
import { deletePage, restorePage } from "../../../services/pages/lifecycle/page-lifecycle";
import type { AppBindings } from "../../../shared/contracts/http";
import { getAuthenticatedUser as requireUser } from "../../http/auth";

import { getPageRecord as getPage } from "../../../services/access/resource-access-records";
import { getPageIncludingDeleted } from "../../../services/pages/read/page-records";
import { rejectActiveWorkspaceMismatch as enforceActiveWorkspace } from "../../access/workspace-mismatch";

export const pageLifecycleRoutes = new Hono<AppBindings>();

pageLifecycleRoutes.post("/:id/restore", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getPageIncludingDeleted(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await getMembership(existing.workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const restoreOrgMismatch = await enforceActiveWorkspace(c, existing.workspaceId, user.id);

  if (restoreOrgMismatch) {
    return restoreOrgMismatch;
  }

  return c.json(await restorePage(existing));
});

pageLifecycleRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const existing = await getPage(c.req.param("id"));

  if (!existing) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.id, existing.workspaceId, user.id, "full"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const deleteOrgMismatch = await enforceActiveWorkspace(c, existing.workspaceId, user.id);

  if (deleteOrgMismatch) {
    return deleteOrgMismatch;
  }

  return c.json(await deletePage(existing, user, c.env));
});
