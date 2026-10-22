import { Hono } from "hono";
import { searchWorkspaceOperation } from "../../services/search/operations";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

import type { AppBindings } from "../../shared/contracts/http";

export const searchRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

searchRoutes.get("/", async (c) =>
  c.json(
    await searchWorkspaceOperation(serverOperationContext(c), {
      workspaceId: c.req.query("workspaceId"),
      types: c.req.query("types"),
      q: c.req.query("q"),
      mode: c.req.query("mode"),
    }),
    200,
  ),
);
