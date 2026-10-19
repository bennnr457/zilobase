import { and, eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { calendarAccount, calendarBinding } from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import { getStringEnv } from "../../../shared/config/config";
import { createCalendarGateway } from "../provider/oauth";
import { stopCalendarWatches } from "../realtime/watches";
import { disconnectCalendarBinding, requireCalendarBinding } from "./ownership";
export async function listCalendarConnections(
  userId: string,
  workspaceId: string,
  env: RuntimeEnv,
) {
  const rows = await db
    .select({ binding: calendarBinding, account: calendarAccount })
    .from(calendarBinding)
    .innerJoin(calendarAccount, eq(calendarAccount.id, calendarBinding.accountId))
    .where(and(eq(calendarBinding.userId, userId), eq(calendarBinding.workspaceId, workspaceId)));
  return {
    connections: rows.map(({ binding, account }) => ({
      bindingId: binding.id,
      workspaceId: binding.workspaceId,
      accountId: account.id,
      email: account.email,
      status: account.status,
      pushAvailable: false,
    })),
    providerConfigured: Boolean(
      getStringEnv(env, "CALENDAR_GOOGLE_CLIENT_ID") &&
      getStringEnv(env, "CALENDAR_GOOGLE_CLIENT_SECRET") &&
      getStringEnv(env, "CALENDAR_TOKEN_ENCRYPTION_KEY"),
    ),
  };
}

export async function disconnectOwnedCalendar(
  owned: Awaited<ReturnType<typeof requireCalendarBinding>>,
  userId: string,
  workspaceId: string,
  bindingId: string,
  env: RuntimeEnv,
) {
  const bindings = await db
    .select()
    .from(calendarBinding)
    .where(eq(calendarBinding.accountId, owned.account.id));
  if (bindings.length === 1) {
    try {
      await stopCalendarWatches(owned.account.id, await createCalendarGateway(env, owned.account));
    } catch {
      /* Local disconnect still revokes access; abandoned watches expire. */
    }
  }
  await disconnectCalendarBinding(userId, workspaceId, bindingId);
}
