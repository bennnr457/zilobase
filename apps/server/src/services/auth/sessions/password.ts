import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { account } from "../../../infrastructure/database/schema";
export async function getUserHasPassword(userId: string) {
  const [credentialAccount] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "credential"),
        isNotNull(account.password),
      ),
    )
    .limit(1);

  return Boolean(credentialAccount);
}
