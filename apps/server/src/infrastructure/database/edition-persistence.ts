import { and, count, eq, inArray, notInArray, sql } from "drizzle-orm";

import type { Database } from "./index";
import { instanceSettings, member, user } from "./schema";

import type { EditionPersistencePort } from "../../shared/contracts/edition";
export const editionPersistencePort: EditionPersistencePort = {
  async countWorkspaceMemberships(database, input) {
    if (!input.roles.length) return 0;
    const coreDatabase = database as Database;
    const conditions = [
      eq(member.organizationId, input.workspaceId),
      inArray(member.role, [...input.roles]),
      input.excludedUserIds?.length
        ? notInArray(member.userId, [...input.excludedUserIds])
        : undefined,
    ].filter((condition) => condition !== undefined);
    const [row] = await coreDatabase
      .select({ value: count() })
      .from(member)
      .where(and(...conditions));
    return row?.value ?? 0;
  },

  async findVerifiedUsersByEmail(database, normalizedEmail) {
    const coreDatabase = database as Database;
    return coreDatabase
      .select({ emailVerified: user.emailVerified, id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${normalizedEmail}`)
      .orderBy(user.id)
      .limit(2);
  },

  async hasEnabledMembershipTrigger(database, triggerName) {
    const coreDatabase = database as Database;
    const result = (await coreDatabase.execute(sql`
      select exists (
        select 1
        from pg_trigger
        where tgrelid = to_regclass('public.member')
          and tgname = ${triggerName}
          and not tgisinternal
          and tgenabled <> 'D'
      ) as available
    `)) as unknown as { rows: Array<{ available: boolean }> };
    return result.rows[0]?.available ?? false;
  },

  async readInstance(database) {
    const coreDatabase = database as Database;
    const [row] = await coreDatabase
      .select({
        instanceId: instanceSettings.instanceId,
        pinnedWorkspaceId: instanceSettings.pinnedWorkspaceId,
      })
      .from(instanceSettings)
      .where(eq(instanceSettings.id, "primary"))
      .limit(1);
    return row ?? null;
  },

  async readWorkspaceMembership(database, input) {
    const coreDatabase = database as Database;
    const [row] = await coreDatabase
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, input.workspaceId), eq(member.userId, input.userId)))
      .limit(1);
    return row ?? null;
  },
};
