import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import type { ZilobaseAuthClient } from "../shared/context";
import type { SessionResponse } from "./contracts";

export const sessionQueryKey = ["session"] as const;

export function updateSessionImage(queryClient: QueryClient, image: string | null) {
  queryClient.setQueryData<SessionResponse>(sessionQueryKey, (current) => {
    if (!current?.user) return current;
    return { ...current, user: { ...current.user, image } };
  });
}

export const sessionQueryOptions = (auth: ZilobaseAuthClient) =>
  queryOptions({
    queryKey: sessionQueryKey,
    // Router guards await this same query imperatively. Do not consume the
    // observer-owned signal or a temporary React unsubscribe can cancel the
    // promise that is still required by the router.
    queryFn: async () => {
      try {
        return await auth.getSession();
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return { user: null, session: null };
        }

        throw error;
      }
    },
  });
