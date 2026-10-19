import { and, eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { favorite, itemVisit } from "../../../infrastructure/database/schema";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import {
  canAccessDatabaseInWorkspace,
  canAccessPageInWorkspace,
} from "../../access/effective-access";

export async function recordItemVisit(
  itemId: string,
  itemKind: "page" | "database",
  workspaceId: string,
  user: { id: string },
) {
  const canView =
    itemKind === "page"
      ? await canAccessPageInWorkspace(itemId, workspaceId, user.id, "view")
      : await canAccessDatabaseInWorkspace(itemId, workspaceId, user.id, "view");

  if (!canView) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  const now = new Date();

  await db
    .insert(itemVisit)
    .values({
      id: crypto.randomUUID(),
      itemId,
      itemKind,
      workspaceId,
      userId: user.id,
      createdAt: now,
      lastVisitedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        lastVisitedAt: now,
        updatedAt: now,
      },
      target: [itemVisit.userId, itemVisit.itemKind, itemVisit.itemId],
    });

  return {
    itemId,
    itemKind,
    lastVisitedAt: now,
  };
}

export async function favoritePage(pageId: string, userId: string) {
  await db
    .insert(favorite)
    .values({
      id: crypto.randomUUID(),
      userId: userId,
      pageId: pageId,
    })
    .onConflictDoNothing({
      target: [favorite.userId, favorite.pageId],
    });
}

export async function unfavoritePage(pageId: string, userId: string) {
  await db.delete(favorite).where(and(eq(favorite.userId, userId), eq(favorite.pageId, pageId)));
}
