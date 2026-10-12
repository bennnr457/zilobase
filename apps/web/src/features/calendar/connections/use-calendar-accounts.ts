import { useSession } from "@zilobase/features/auth/react";
import { useCalendarAccounts as useAccounts } from "@zilobase/features/calendar/react";
import { calendarDatabaseName, destroyCalendarDatabase } from "../storage/calendar-database";
import { toApiUrl, getApiErrorMessage } from "@/platform/network/api";
import { isDesktopApp } from "@/platform/environment";
import { desktopBridge } from "@/platform/desktop/native";
import { toast } from "sonner";
export { calendarSourcesQueryKey } from "@zilobase/features/calendar";
export function useCalendarAccounts(workspaceId: string) {
  const { data: session } = useSession();
  return useAccounts(workspaceId, {
    client: isDesktopApp() ? "desktop" : "web",
    authorize: async (url) => {
      if (isDesktopApp()) await desktopBridge().auth.openAuthorizationUrl(url);
      else window.location.assign(url);
    },
    disconnected: async (connection, bindingId) => {
      if (session?.user?.id)
        await destroyCalendarDatabase(
          calendarDatabaseName({
            apiOrigin: new URL(toApiUrl("/"), window.location.origin).origin,
            userId: session.user.id,
            workspaceId: connection.workspaceId,
            bindingId,
          }),
        );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}
