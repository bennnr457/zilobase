import { useMutation, useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/react";
import { useZilobaseFeatures } from "../shared/context";
import type { CalendarConnection } from "./contracts";
import { connectCalendar, disconnectCalendarConnection } from "./operations";
import { calendarAccountsQueryOptions } from "./queries";
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
  const context = useZilobaseFeatures();
  const { apiFetch } = context;
  const accounts = useQuery(
    calendarAccountsQueryOptions(apiFetch, session?.user?.id ?? "", workspaceId),
  );
  const connect = useMutation({
    mutationFn: async () => {
      const { authorizationUrl } = await connectCalendar(context, {
        workspaceId,
        client: options.client,
      });
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
      await disconnectCalendarConnection(context, { connection });
      return connection;
    },
    onSuccess: async (connection, bindingId) => {
      await options.disconnected(connection, bindingId);
    },
    onError: options.onError,
  });
  return { accounts, connect, disconnect };
}
