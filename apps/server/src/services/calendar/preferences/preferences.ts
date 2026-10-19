import type { CalendarPreferences } from "@zilobase/features/runtime";
import { defaultCalendarPreferences } from "@zilobase/features/runtime";
import { and, eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { calendarPreference } from "../../../infrastructure/database/schema";

export async function readCalendarPreferences(userId: string, workspaceId: string) {
  const [row] = await db
    .select()
    .from(calendarPreference)
    .where(
      and(eq(calendarPreference.userId, userId), eq(calendarPreference.workspaceId, workspaceId)),
    );
  return row ? row.data : defaultCalendarPreferences();
}

export async function saveCalendarPreferences(
  userId: string,
  workspaceId: string,
  data: CalendarPreferences,
) {
  await db
    .insert(calendarPreference)
    .values({ userId: userId, workspaceId: workspaceId, data })
    .onConflictDoUpdate({
      target: [calendarPreference.userId, calendarPreference.workspaceId],
      set: { data },
    });
}
