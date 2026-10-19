import { Hono } from "hono";
import { getDatabaseRecord } from "../../services/databases/access/database-access";
import { readDatabaseAccess } from "../../services/databases/read/operations";
import type { AppBindings } from "../../shared/contracts/http";
import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware";
import { serverOperationContext } from "../http/operation-context";
import { requireDatabaseRouteUser as requireUser } from "./support";

export const databaseCoreRoutes = new Hono<AppBindings>();
const resourceWorkspace = pinnedResourceMiddleware((id) =>
  getDatabaseRecord(id, { includeDeleted: true }),
);

databaseCoreRoutes.get("/:id/access", resourceWorkspace, async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json(
    await readDatabaseAccess(serverOperationContext(c), { databaseId: c.req.param("id") }),
  );
});
