import { and, eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { calendarProviderCalendar } from "../../../infrastructure/database/schema";

export function readProviderCalendarStates(accountId: string) {
  return db
    .select()
    .from(calendarProviderCalendar)
    .where(eq(calendarProviderCalendar.accountId, accountId));
}
export async function readProviderCalendarState(accountId: string, calendarId: string) {
  const [state] = await db
    .select()
    .from(calendarProviderCalendar)
    .where(
      and(
        eq(calendarProviderCalendar.accountId, accountId),
        eq(calendarProviderCalendar.calendarId, calendarId),
      ),
    );
  return state;
}
