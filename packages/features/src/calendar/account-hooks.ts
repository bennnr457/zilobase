import { useSession } from "../auth/hooks";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import type { CalendarConnection } from "./contracts";
import { calendarAccountsQueryOptions, calendarSourcesQueryKey } from "./queries";
import { startCalendarConnection, disconnectCalendar } from "./mutations";
export function useCalendarAccounts(
  workspaceId: string,
  options: {
    client: "web" | "desktop";
    authorize: (url: string) => void | Promise<void>;
    disconnected: (connection: CalendarConnection, bindingId: string) => void | Promise<void>;
    onError: (error: unknown) => void;
  },
) {
  const { data: session } = useSession();
  const { apiFetch, queryClient: client } = useZilobaseFeatures();
  const accounts = useQuery(
    calendarAccountsQueryOptions(apiFetch, session?.user?.id ?? "", workspaceId),
  );
  const connect = useMutation({
    mutationFn: async () => {
      const { authorizationUrl } = await startCalendarConnection(
        apiFetch,
        workspaceId,
        options.client,
      );
      await options.authorize(authorizationUrl);
    },
    onError: options.onError,
  });
  const disconnect = useMutation({
    mutationFn: async (bindingId: string) => {
      const connection = accounts.data?.connections.find(
        (source) => source.bindingId === bindingId,
      );
      if (!connection) throw new Error("Calendar source is no longer available.");
      await disconnectCalendar(apiFetch, connection);
      return connection;
    },
    onSuccess: async (connection, bindingId) => {
      await options.disconnected(connection, bindingId);
      await client.invalidateQueries({ queryKey: calendarSourcesQueryKey });
    },
    onError: options.onError,
  });
  return { accounts, connect, disconnect };
}
