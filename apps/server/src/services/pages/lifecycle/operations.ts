import { canAccessPageInWorkspace } from "../../access/effective-access";
import { getMembership } from "../../access/principal-access";
import { getPageRecord as getPage } from "../../access/resource-access-records";
import {
  requireOperationActor,
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { deletePage, restorePage } from "../../pages/lifecycle/page-lifecycle";
import { getPageIncludingDeleted } from "../../pages/read/page-records";
import { requireActivePageWorkspace, requirePageOperationWorkspace } from "../access";

export type RestorePageInput = { pageId: string };
export async function restorePageOperation(
  context: ServerOperationContext,
  input: RestorePageInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const user = requireOperationActor(context);

  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }

  const existing = await getPageIncludingDeleted(input.pageId);

  if (!existing) {
    return deny({ error: "Page not found" }, 404);
  }

  if (!(await getMembership(existing.workspaceId, user.id))) {
    return deny({ error: "Forbidden" }, 403);
  }

  await requireActivePageWorkspace(context, existing.workspaceId, user.id);

  return await restorePage(existing);
}

export type DeletePageInput = { pageId: string };
export async function deletePageOperation(context: ServerOperationContext, input: DeletePageInput) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const user = requireOperationActor(context);

  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }

  const existing = await getPage(input.pageId);

  if (!existing) {
    return deny({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(existing.id, existing.workspaceId, user.id, "full"))) {
    return deny({ error: "Forbidden" }, 403);
  }

  await requireActivePageWorkspace(context, existing.workspaceId, user.id);

  return await deletePage(existing, user, context.env);
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
