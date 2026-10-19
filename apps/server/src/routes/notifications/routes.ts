import { Hono } from "hono";
import {
  listNotificationsOperation,
  markNotificationReadOperation,
} from "../../services/notifications/operations";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

import type { AppBindings } from "../../shared/contracts/http";

export const notificationRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

notificationRoutes.get("/:workspaceId/notifications", async (c) =>
  c.json(
    await listNotificationsOperation(serverOperationContext(c), {
      limit: c.req.query("limit"),
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);

notificationRoutes.post("/:workspaceId/notifications/:notificationId/read", async (c) =>
  c.json(
    await markNotificationReadOperation(serverOperationContext(c), {
      notificationId: c.req.param("notificationId")!,
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);
