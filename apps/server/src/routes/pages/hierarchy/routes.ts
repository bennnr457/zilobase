import { Hono } from "hono";
import {
  convertToTeamspacePageOperation,
  createPageOperation,
  embedPageOperation,
  moveToTeamspacePageOperation,
  removeEmbedPageOperation,
} from "../../../services/pages/hierarchy/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { readJsonBody } from "../../http/request";
import { attachServiceErrorHandler } from "../../http/route-error";
export const pageHierarchyRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

pageHierarchyRoutes.post("/", async (c) => {
  const result = await createPageOperation(serverOperationContext(c), { body: undefined }, () =>
    readJsonBody(c.req),
  );
  return c.json(result, 201);
});

pageHierarchyRoutes.post("/:id/move-teamspace", async (c) => {
  const result = await moveToTeamspacePageOperation(
    serverOperationContext(c),
    { pageId: c.req.param("id"), body: undefined },
    () => readJsonBody(c.req),
  );
  return c.json(result);
});

pageHierarchyRoutes.post("/:id/convert-to-teamspace", async (c) => {
  const result = await convertToTeamspacePageOperation(
    serverOperationContext(c),
    { pageId: c.req.param("id"), body: undefined },
    () => readJsonBody(c.req, {}),
  );
  return c.json(result, 201);
});

pageHierarchyRoutes.post("/:id/embed-item", async (c) => {
  const result = await embedPageOperation(
    serverOperationContext(c),
    { pageId: c.req.param("id"), body: undefined },
    () => readJsonBody(c.req),
  );
  return c.json(result);
});

pageHierarchyRoutes.delete("/:id/embed-item", async (c) => {
  const result = await removeEmbedPageOperation(
    serverOperationContext(c),
    { pageId: c.req.param("id"), body: undefined },
    () => readJsonBody(c.req),
  );
  return c.json(result);
});
