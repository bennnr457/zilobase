import { hasAccess, type AccessLevel } from "../../access/access-level";
import {
  getEffectivePageAccessInWorkspace,
  isPagePublishedInWorkspace,
} from "../../access/effective-access";
import { getMembership } from "../../access/principal-access";
import { getPageRecord } from "../../access/resource-access-records";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { requireActivePageWorkspace, requirePageOperationWorkspace } from "../access";
import { getPageDetail } from "./page-detail";
import { listWorkspacePages } from "./page-list";
import { getPageIncludingDeleted } from "./page-records";

export async function listPagesOperation(
  context: ServerOperationContext,
  input: { workspaceId?: string; deleted?: boolean },
) {
  requireOperationPolicy(context, { write: false, oauthScope: "pages.read" });
  const user = requireOperationActor(context);
  if (!input.workspaceId) throw new ServerOperationError({ error: "workspaceId is required" }, 400);
  requireOperationWorkspace(context, input.workspaceId);
  return listWorkspacePages(input.workspaceId, user.id, input.deleted ?? false);
}

export async function getPageOperation(context: ServerOperationContext, input: { pageId: string }) {
  requireOperationPolicy(context, { write: false, oauthScope: "pages.read" });
  await requirePageOperationWorkspace(context, input.pageId);
  const user = context.authentication.user;
  const record = await getPageIncludingDeleted(input.pageId);
  if (!record) throw new ServerOperationError({ error: "Page not found" }, 404);
  let accessLevel: AccessLevel = "none";
  let usesPublishedFallback = false;
  if (record.deletedAt && user)
    accessLevel = (await getMembership(record.workspaceId, user.id)) ? "full" : "none";
  else if (user)
    accessLevel = await getEffectivePageAccessInWorkspace(record.id, record.workspaceId, user.id);
  if (!hasAccess(accessLevel, "view")) {
    if (!(await isPagePublishedInWorkspace(record.id, record.workspaceId)))
      throw new ServerOperationError(
        { error: user ? "Forbidden" : "Unauthorized" },
        user ? 403 : 401,
      );
    usesPublishedFallback = true;
  }
  if (user && hasAccess(accessLevel, "view"))
    await requireActivePageWorkspace(context, record.workspaceId, user.id);
  return getPageDetail(record, user, accessLevel, usesPublishedFallback);
}

export async function getPagePublishedOperation(
  context: ServerOperationContext,
  input: { pageId: string },
) {
  requireOperationPolicy(context, { write: false, oauthScope: "pages.read" });
  await requirePageOperationWorkspace(context, input.pageId);
  const record = await getPageRecord(input.pageId);
  if (!record) throw new ServerOperationError({ published: false }, 404);
  return { published: await isPagePublishedInWorkspace(record.id, record.workspaceId) };
}
