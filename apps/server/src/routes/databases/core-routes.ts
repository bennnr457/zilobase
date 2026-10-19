import { Hono } from "hono";
import { getDatabaseRecord } from "../../services/databases/access/database-access";
import { listDatabaseAccessRulesService } from "../../services/databases/sharing/service";
import type { AppBindings } from "../../shared/contracts/http";
import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware";
import { requireDatabaseRouteUser as requireUser } from "./support";

export const databaseCoreRoutes = new Hono<AppBindings>();
const resourceWorkspace = pinnedResourceMiddleware((id) =>
  getDatabaseRecord(id, { includeDeleted: true }),
);

databaseCoreRoutes.get("/:id/access", resourceWorkspace, async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json(
    await listDatabaseAccessRulesService({
      databaseId: c.req.param("id"),
      userId: user.id,
    }),
  );
});
