import { eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { page } from "../../../infrastructure/database/schema";
export const getPageIncludingDeleted = async (id: string) => {
  const [record] = await db.select().from(page).where(eq(page.id, id)).limit(1);

  return record ?? null;
};

export type PageRecord = NonNullable<Awaited<ReturnType<typeof getPageIncludingDeleted>>>;

export async function getPageContentRevision(pageId: string) {
  const [record] = await db
    .select({ id: page.id, updatedAt: page.updatedAt })
    .from(page)
    .where(eq(page.id, pageId));
  return record;
}
