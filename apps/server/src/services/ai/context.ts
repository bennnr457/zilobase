import { readableDatabase } from "../databases/read/operations";
import { readPageIdentity } from "../pages/read/document-window";
import { getMembership } from "../access/principal-access";
import { getDatabaseTitleSourcesService } from "../databases/read/service";
import { getDatabaseEmoji } from "@zilobase/features/runtime";
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

export async function chatSourceIdentity(
  context: ServerOperationContext,
  workspaceId: string,
  type: string,
  id: string,
) {
  await authorizeChatWorkspace(context, workspaceId);
  const scoped = { ...context, pinnedWorkspaceId: workspaceId };
  if (type === "page") {
    const record = await readPageIdentity(scoped, id);
    const metadata = record.metadata as { emoji?: unknown } | null;
    return {
      title: record.name,
      emoji: typeof metadata?.emoji === "string" ? metadata.emoji : null,
    };
  }
  if (type !== "database") throw new ServerOperationError({ error: "Invalid source type" }, 400);
  const result = await readableDatabase(scoped, id, false);
  if (result.viewerType === "public")
    throw new ServerOperationError({ error: "Source unavailable" }, 403);
  const titleSources = await getDatabaseTitleSourcesService([result.record], result.user!.id);
  const source = titleSources.get(id);
  return {
    title: source?.name ?? result.record.name,
    emoji: getDatabaseEmoji(source ?? result.record),
  };
}
