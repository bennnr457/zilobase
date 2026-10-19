import { Hono } from "hono";
import { getMembership } from "../../../services/access/principal-access";
import {
  favoritePage,
  recordItemVisit,
  unfavoritePage,
} from "../../../services/pages/navigation/page-navigation";
import type { AppBindings } from "../../../shared/contracts/http";
import { rejectMismatchedPinnedWorkspace } from "../../auth/oauth/oauth-access";
import { readAuthenticatedJson } from "../../http/auth";
import { authorizePageRoute } from "../access";

export const pageVisitRoutes = new Hono<AppBindings>();
export const pageNavigationRoutes = new Hono<AppBindings>();
pageVisitRoutes.post("/item-visits", async (c) => {
  const request = await readAuthenticatedJson(c);
  if (!request.ok) return request.response;
  const { user, body } = request;

  const { itemId, itemKind, workspaceId } = body as {
    itemId?: unknown;
    itemKind?: unknown;
    workspaceId?: unknown;
  };

  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  if (itemKind !== "page" && itemKind !== "database") {
    return c.json({ error: "itemKind must be page or database" }, 400);
  }

  if (typeof itemId !== "string" || itemId.length === 0) {
    return c.json({ error: "itemId is required" }, 400);
  }

  const mismatch = rejectMismatchedPinnedWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (!(await getMembership(workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json(await recordItemVisit(itemId, itemKind, workspaceId, user));
});

pageNavigationRoutes.put("/:id/favorite", async (c) => {
  const authorization = await authorizePageRoute(c, "view");
  if (!authorization.ok) return authorization.response;
  const { user, record } = authorization;

  await favoritePage(record.id, user.id);
  return c.json({ page: { ...record, isFavorite: true } });
});

pageNavigationRoutes.delete("/:id/favorite", async (c) => {
  const authorization = await authorizePageRoute(c, "view");
  if (!authorization.ok) return authorization.response;
  const { user, record } = authorization;

  await unfavoritePage(record.id, user.id);
  return c.json({ page: { ...record, isFavorite: false } });
});
