import { getMembership } from "../../access/principal-access";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import {
  favoritePage,
  recordItemVisit,
  unfavoritePage,
} from "../../pages/navigation/page-navigation";
import { authorizePageOperation, requirePageOperationWorkspace } from "../access";

export type RecordVisitPageInput = { body: unknown };
export async function recordVisitPageOperation(
  context: ServerOperationContext,
  input: RecordVisitPageInput,
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });

  const user = requireOperationActor(context);
  const body = readBody ? await readBody() : input.body;
  if (!body || typeof body !== "object") return deny({ error: "A JSON body is required" }, 400);

  const { itemId, itemKind, workspaceId } = body as {
    itemId?: unknown;
    itemKind?: unknown;
    workspaceId?: unknown;
  };

  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return deny({ error: "workspaceId is required" }, 400);
  }

  if (itemKind !== "page" && itemKind !== "database") {
    return deny({ error: "itemKind must be page or database" }, 400);
  }

  if (typeof itemId !== "string" || itemId.length === 0) {
    return deny({ error: "itemId is required" }, 400);
  }

  requireOperationWorkspace(context, workspaceId);

  if (!(await getMembership(workspaceId, user.id))) {
    return deny({ error: "Forbidden" }, 403);
  }

  return await recordItemVisit(itemId, itemKind, workspaceId, user);
}

export type FavoritePageInput = { pageId: string };
export async function favoritePageOperation(
  context: ServerOperationContext,
  input: FavoritePageInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "view");
  const { user, record } = authorization;

  await favoritePage(record.id, user.id);
  return { page: { ...record, isFavorite: true } };
}

export type UnfavoritePageInput = { pageId: string };
export async function unfavoritePageOperation(
  context: ServerOperationContext,
  input: UnfavoritePageInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const authorization = await authorizePageOperation(context, input.pageId, "view");
  const { user, record } = authorization;

  await unfavoritePage(record.id, user.id);
  return { page: { ...record, isFavorite: false } };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
