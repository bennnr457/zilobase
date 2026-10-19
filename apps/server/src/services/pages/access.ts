import { hasAccess, type AccessLevel } from "../access/access-level";
import { getEffectivePageAccessInWorkspace } from "../access/effective-access";
import { getMembership } from "../access/principal-access";
import { getPageRecord } from "../access/resource-access-records";
import {
  requireOperationActor,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { getPageIncludingDeleted } from "./read/page-records";

export async function requirePageOperationWorkspace(
  context: ServerOperationContext,
  pageId: string,
) {
  if (!context.pinnedWorkspaceId) return;
  const record = await getPageIncludingDeleted(pageId);
  if (!record) throw new ServerOperationError({ error: "Resource not found" }, 404);
  requireOperationWorkspace(context, record.workspaceId);
}

export async function requireActivePageWorkspace(
  context: ServerOperationContext,
  workspaceId: string,
  userId: string,
) {
  if (
    !context.activeWorkspaceId ||
    context.activeWorkspaceId === workspaceId ||
    !(await getMembership(workspaceId, userId))
  )
    return;
  throw new ServerOperationError(
    {
      code: "ACTIVE_ORGANIZATION_MISMATCH",
      error: "Switch to the page workspace to continue.",
      workspaceId,
    },
    409,
  );
}

/** Authenticate, load, authorize, then check the active workspace, in HTTP order. */
export async function authorizePageOperation(
  context: ServerOperationContext,
  pageId: string,
  required: Exclude<AccessLevel, "none">,
) {
  const user = requireOperationActor(context);
  const record = await getPageRecord(pageId);
  if (!record) throw new ServerOperationError({ error: "Page not found" }, 404);
  const accessLevel = await getEffectivePageAccessInWorkspace(
    record.id,
    record.workspaceId,
    user.id,
  );
  if (!hasAccess(accessLevel, required))
    throw new ServerOperationError({ error: "Forbidden" }, 403);
  await requireActivePageWorkspace(context, record.workspaceId, user.id);
  return { user, record, accessLevel };
}
