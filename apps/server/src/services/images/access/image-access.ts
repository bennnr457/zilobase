import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { database, imageAsset } from "../../../infrastructure/database/schema";
export async function getActiveImageAsset(id: string) {
  const [asset] = await db
    .select()
    .from(imageAsset)
    .where(and(eq(imageAsset.id, id), isNull(imageAsset.deletedAt)))
    .limit(1);

  return asset ?? null;
}

export async function isWorkspaceDatabase(id: string, workspaceId: string) {
  const [record] = await db
    .select({ id: database.id })
    .from(database)
    .where(
      and(eq(database.id, id), eq(database.workspaceId, workspaceId), isNull(database.deletedAt)),
    )
    .limit(1);

  return Boolean(record);
}

export async function getReadableImageAsset(id: string) {
  const asset = await getActiveImageAsset(id);

  return asset?.status === "uploaded" ? asset : null;
}
