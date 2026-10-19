import { getWorkspacePrincipalKind } from "../../access/principal-access";
import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { preparePageCollaboration } from "../../pages/content/collaboration-bootstrap";
import { replacePageBody, updatePage } from "../../pages/content/update-page";
import { getPagePropertyPayload } from "../../pages/properties/property-payload";
import { updatePageProperty } from "../../pages/properties/update-value";
import { authorizePageOperation, requirePageOperationWorkspace } from "../access";

export type GetPropertiesPageInput = { pageId: string };
export async function getPropertiesPageOperation(
  context: ServerOperationContext,
  input: GetPropertiesPageInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: "pages.read" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "view");
  const { user, record } = authorization;

  return {
    ...(await getPagePropertyPayload(record.id, record.workspaceId, user.id)),
    viewerType: (await getWorkspacePrincipalKind(record.workspaceId, user.id)) ?? "guest",
  };
}

export type UpdatePropertyPageInput = { pageId: string; body: unknown; propertyId: string };
export async function updatePropertyPageOperation(
  context: ServerOperationContext,
  input: UpdatePropertyPageInput,
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "edit");
  const { user, record } = authorization;

  const body = readBody ? await readBody() : input.body;

  if (!body || typeof body !== "object") {
    return deny({ error: "A JSON body is required" }, 400);
  }

  const propertyId = input.propertyId!;
  const { value = null } = body as { value?: unknown };
  return await updatePageProperty(
    record,
    user,
    propertyId,
    value,
    context.env,
    context.authentication.authMethod === "apiKey",
  );
}

export type PrepareCollaborationPageInput = { pageId: string; body: unknown };
export async function prepareCollaborationPageOperation(
  context: ServerOperationContext,
  input: PrepareCollaborationPageInput,
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "view");
  const { user, record: existing, accessLevel } = authorization;

  const body = readBody ? await readBody() : input.body;
  if (
    !body ||
    typeof body !== "object" ||
    !("includeState" in body) ||
    typeof body.includeState !== "boolean"
  ) {
    return deny({ error: "includeState must be a boolean" }, 400);
  }

  const bootstrap = await preparePageCollaboration(
    existing,
    user,
    accessLevel,
    body.includeState,
    context.env,
  );
  return bootstrap;
}

export type ReplaceContentPageInput = { pageId: string; body: unknown };
export async function replaceContentPageOperation(
  context: ServerOperationContext,
  input: ReplaceContentPageInput,
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "edit");
  const { user, record: existing } = authorization;

  const body = readBody ? await readBody() : input.body;

  if (!body || typeof body !== "object") {
    return deny({ error: "A JSON body is required" }, 400);
  }

  const { content, baseUpdatedAt } = body as {
    baseUpdatedAt?: unknown;
    content?: unknown;
  };

  if (!("content" in body)) {
    return deny({ error: "content is required" }, 400);
  }

  let baseRevision: Date | undefined;
  if (baseUpdatedAt !== undefined) {
    if (typeof baseUpdatedAt !== "string")
      return deny({ error: "baseUpdatedAt must be a string" }, 400);
    baseRevision = new Date(baseUpdatedAt);
    if (Number.isNaN(baseRevision.getTime()))
      return deny({ error: "baseUpdatedAt must be a valid date" }, 400);
  }
  const result = await replacePageBody(existing, user, content, context.env, baseRevision);
  if ("conflict" in result)
    return deny(
      { error: "Page content was updated by another request.", page: result.conflict },
      409,
    );
  return { page: result.page };
}

export type UpdatePageInput = { pageId: string; body: unknown };
export async function updatePageOperation(
  context: ServerOperationContext,
  input: UpdatePageInput,
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "edit");
  const { user, record: existing } = authorization;

  const body = readBody ? await readBody() : input.body;

  if (!body || typeof body !== "object") {
    return deny({ error: "A JSON body is required" }, 400);
  }

  const patch = body as {
    type?: unknown;
    name?: unknown;
    url?: unknown;
    content?: unknown;
    metadata?: unknown;
  };
  return await updatePage(
    existing,
    user,
    patch,
    context.env,
    context.authentication.authMethod === "apiKey",
  );
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
