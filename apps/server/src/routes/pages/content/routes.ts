import { getCollaborationWebSocketUrl } from "@zilobase/runtime-adapter/capabilities";
import { Hono } from "hono";
import {
  getPropertiesPageOperation,
  prepareCollaborationPageOperation,
  replaceContentPageOperation,
  updatePageOperation,
  updatePropertyPageOperation,
} from "../../../services/pages/content/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { readJsonBody } from "../../http/request";
import { attachServiceErrorHandler } from "../../http/route-error";
export const pageContentRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

pageContentRoutes.get("/:id/properties", async (c) => {
  const result = await getPropertiesPageOperation(serverOperationContext(c), {
    pageId: c.req.param("id"),
  });
  return c.json(result);
});

pageContentRoutes.put("/:id/properties/:propertyId/value", async (c) => {
  const result = await updatePropertyPageOperation(
    serverOperationContext(c),
    { pageId: c.req.param("id"), propertyId: c.req.param("propertyId"), body: undefined },
    () => readJsonBody(c.req),
  );
  return c.json(result);
});

pageContentRoutes.post("/:id/collaboration-bootstrap", async (c) => {
  const result = await prepareCollaborationPageOperation(
    serverOperationContext(c),
    { pageId: c.req.param("id"), body: undefined },
    () => readJsonBody(c.req),
  );
  const websocketUrl = new URL(getCollaborationWebSocketUrl(c.req.raw));
  websocketUrl.searchParams.set("document", result.documentName);
  c.header("Cache-Control", "no-store");
  return c.json({ ...result, websocketUrl: websocketUrl.toString() });
});

pageContentRoutes.patch("/:id/content", async (c) => {
  const result = await replaceContentPageOperation(
    serverOperationContext(c),
    { pageId: c.req.param("id"), body: undefined },
    () => readJsonBody(c.req),
  );
  return c.json(result);
});

pageContentRoutes.patch("/:id", async (c) => {
  const result = await updatePageOperation(
    serverOperationContext(c),
    { pageId: c.req.param("id"), body: undefined },
    () => readJsonBody(c.req),
  );
  return c.json(result);
});
