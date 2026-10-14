import type { ApiFetcher } from "../shared/api-fetcher";
import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import type { ZilobaseAuthClient } from "../shared/auth-client";
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

/** Backend operations behind the existing auth port; platform side effects wrap these methods. */
export function createApiAuthClient(apiFetch: ApiFetcher): ZilobaseAuthClient {
  const post = <T>(path: string, body: unknown) =>
    apiFetch<T>(`/api/auth${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  return {
    getSession: (signal) => apiFetch("/session", { signal }),
    requestSignInOtp: (email) =>
      post("/email-otp/send-verification-otp", { email, type: "sign-in" }),
    signInWithOtp: (input) => post("/sign-in/email-otp", input),
    signInWithPassword: (input) => post("/sign-in/email", input),
    signUp: (input) => post("/sign-up/email", input),
    requestEmailVerificationOtp: (email) =>
      post("/email-otp/send-verification-otp", { email, type: "email-verification" }),
    verifyEmailOtp: (input) => post("/email-otp/verify-email", input),
    signOut: () => post("/sign-out", {}),
    createWorkspace: (input) => post("/workspace/create", input),
    setActiveWorkspace: (workspaceId) => post("/workspace/set-active", { workspaceId }),
    inviteWorkspaceMember: (input) => post("/workspace/invite-member", input),
    acceptWorkspaceInvitation: (input) => post("/workspace/accept-invitation", input),
    listWorkspaces: (signal) => apiFetch("/api/auth/workspace/list", { signal }),
    listWorkspaceInvitations: (workspaceId, signal) =>
      apiFetch(
        `/api/auth/workspace/list-invitations?workspaceId=${encodeURIComponent(workspaceId)}`,
        { signal },
      ),
  };
}
