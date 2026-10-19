import { and, eq } from "drizzle-orm";
import { db } from "../../../../infrastructure/database/index";
import { slackConnection } from "../../../../infrastructure/database/schema";
import { invalidateDatabaseAutomationDependencies } from "../../definition/definition-catalog";

export async function findOwnedSlackConnection(connectionId: string, userId: string) {
  const [connection] = await db
    .select()
    .from(slackConnection)
    .where(and(eq(slackConnection.id, connectionId), eq(slackConnection.ownerUserId, userId)))
    .limit(1);
  return connection;
}
export async function revokeSlackConnection(
  connectionId: string,
  userId: string,
  code: string,
  reason: string,
) {
  await db
    .update(slackConnection)
    .set({ lastErrorCode: code, status: "revoked", updatedAt: new Date() })
    .where(and(eq(slackConnection.id, connectionId), eq(slackConnection.ownerUserId, userId)));
  await invalidateDatabaseAutomationDependencies({
    dependencyId: connectionId,
    dependencyType: "slack_connection",
    reason,
  });
}
