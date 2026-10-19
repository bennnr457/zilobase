import { collectWorkspaceContext, type ChatRequest } from "@zilobase/features/runtime";
import { buildContextMarkdown } from "@zilobase/page-context";
import { getPageOperation } from "../pages/read/operations";
import { readDatabaseExport } from "../databases/read/operations";
import { getMembership } from "../access/principal-access";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";

export async function authorizeChatWorkspace(context: ServerOperationContext, workspaceId: string) {
  requireOperationPolicy(context, { write: true });
  const user = requireOperationActor(context);
  requireOperationWorkspace(context, workspaceId);
  if (context.activeWorkspaceId && context.activeWorkspaceId !== workspaceId)
    throw new ServerOperationError({ error: "Switch to the selected workspace first" }, 409);
  if (!(await getMembership(workspaceId, user.id)))
    throw new ServerOperationError({ error: "Forbidden" }, 403);
  return user;
}

export async function assembleChatContext(
  context: ServerOperationContext,
  request: Pick<ChatRequest, "workspaceId" | "roots" | "snapshots">,
  maxChars = 48_000,
) {
  const scoped = { ...context, pinnedWorkspaceId: request.workspaceId };
  const data = await collectWorkspaceContext(request, {
    check: () => context.request?.signal.throwIfAborted(),
    now: () => new Date().toISOString(),
    page: async (pageId) => {
      const detail = await getPageOperation(scoped, { pageId });
      if (detail.viewerType === "public")
        throw new ServerOperationError({ error: "Page is no longer accessible" }, 403);
      return detail.page;
    },
    database: async (databaseId, dataSourceId) => {
      const result = await readDatabaseExport(scoped, { databaseId, dataSourceId });
      if (result.viewerType === "public")
        throw new ServerOperationError({ error: "Database is no longer accessible" }, 403);
      return result;
    },
  });
  const result = buildContextMarkdown({ context: data, maxChars });
  if (result.status === "blocked")
    throw new ServerOperationError({ error: result.omissions.join(" ") }, 422);
  return result;
}
