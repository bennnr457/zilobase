import {
  ZilobaseFeaturesProvider,
  type ZilobaseAuthClient,
  rememberClientSession,
} from "@zilobase/features";
import type { Workspace } from "@zilobase/features/workspaces";
import { createApiAuthClient, type SessionResponse } from "@zilobase/features/auth";
import { apiFetch, clearApiAuthToken } from "@/platform/network/api";
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/features/desktop/diagnostics/index";
import { clientDeployment, queryClient } from "@/app/query-client";
import { useAppStore } from "@/features/desktop/state/app-store";
import { isHostedDemoRuntime, requestDemoGuard } from "@/features/demo";
import posthog from "@/lib/posthog";
import { readOAuthQuery } from "@zilobase/features/oauth";
import { clearPageCacheForUser } from "@/features/editor/collaboration/page-document-cache";
import {
  clearCachedSession,
  readCachedSession,
  webClientCacheStorage,
} from "@/platform/storage/client-cache-storage";
import { getConnectivityState, webClientLifecycle } from "@/platform/network/connectivity";
function withOAuthQuery<T extends Record<string, unknown>>(input: T) {
  if (typeof window === "undefined") {
    return input;
  }

  const oauthQuery = readOAuthQuery(window.location.search);
  return oauthQuery ? { ...input, oauth_query: oauthQuery } : input;
}

const apiAuthClient = createApiAuthClient(apiFetch);
export const webAuthClient: ZilobaseAuthClient = {
  getSession: async (signal) => {
    const startedAt = performance.now();
    recordDesktopDiagnostic("session.request", { status: "started" });
    try {
      const session = await apiFetch<SessionResponse>("/session", {
        signal,
        timeoutMs: 15_000,
      });
      await rememberClientSession(webClientCacheStorage, clientDeployment(), session).catch(
        () => undefined,
      );
      recordDesktopDiagnostic("session.request", {
        duration_ms: performance.now() - startedAt,
        session_present: Boolean(session.session),
        status: "success",
        user_present: Boolean(session.user),
      });
      return session;
    } catch (error) {
      if (getConnectivityState() === "offline") {
        const cached = await readCachedSession().catch(() => null);
        if (cached) return cached;
      }
      recordDesktopDiagnostic(
        "session.request",
        {
          ...describeDesktopError(error),
          duration_ms: performance.now() - startedAt,
        },
        "error",
      );
      throw error;
    }
  },
  requestSignInOtp: (email) =>
    isHostedDemoRuntime() ? rejectDemoAction() : apiAuthClient.requestSignInOtp(email),
  signInWithOtp: (input) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : apiAuthClient.signInWithOtp(withOAuthQuery({ ...input })),
  signInWithPassword: (input) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : apiAuthClient.signInWithPassword(withOAuthQuery({ ...input })),
  signUp: (input) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : apiAuthClient.signUp({
          ...input,
          callbackURL:
            input.callbackURL ??
            (input.invitationId
              ? `/accept-invitation?id=${encodeURIComponent(input.invitationId)}`
              : "/onboarding"),
        }),
  requestEmailVerificationOtp: (email) =>
    isHostedDemoRuntime() ? rejectDemoAction() : apiAuthClient.requestEmailVerificationOtp(email),
  verifyEmailOtp: (input) =>
    isHostedDemoRuntime() ? rejectDemoAction() : apiAuthClient.verifyEmailOtp(input),
  signOut: async () => {
    if (isHostedDemoRuntime()) throw requestDemoGuard();
    const previousSession = await readCachedSession();
    const result = await apiAuthClient.signOut();
    await clearCachedSession();
    if (previousSession?.user) await clearPageCacheForUser(previousSession.user.id);
    posthog?.reset();
    await clearApiAuthToken();
    useAppStore.getState().resetAccountState();
    return result;
  },
  createWorkspace: <TWorkspace,>(input: { name: string; slug: string }) =>
    isHostedDemoRuntime()
      ? rejectDemoAction<TWorkspace>()
      : apiAuthClient.createWorkspace<TWorkspace>(input),
  setActiveWorkspace: (workspaceId) =>
    isHostedDemoRuntime() ? rejectDemoAction() : apiAuthClient.setActiveWorkspace(workspaceId),
  inviteWorkspaceMember: (input) =>
    isHostedDemoRuntime() ? rejectDemoAction() : apiAuthClient.inviteWorkspaceMember(input),
  acceptWorkspaceInvitation: <TResponse,>(input: { invitationId: string }) =>
    isHostedDemoRuntime()
      ? rejectDemoAction<TResponse>()
      : apiAuthClient.acceptWorkspaceInvitation<TResponse>(input),
  listWorkspaces: <TWorkspace,>(signal?: AbortSignal) =>
    isHostedDemoRuntime()
      ? apiFetch<{ workspace: Workspace }>("/demo/bootstrap", { method: "GET", signal }).then(
          ({ workspace }) => [workspace] as TWorkspace[],
        )
      : apiAuthClient.listWorkspaces<TWorkspace>(signal),
  listWorkspaceInvitations: <TInvitation,>(workspaceId: string, signal?: AbortSignal) =>
    isHostedDemoRuntime()
      ? Promise.resolve([])
      : apiAuthClient.listWorkspaceInvitations<TInvitation>(workspaceId, signal),
};

function rejectDemoAction<T = unknown>(): Promise<T> {
  return Promise.reject(requestDemoGuard());
}

export function WebFeaturesProvider({ children }: React.PropsWithChildren) {
  const preferredActiveWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const setPreferredActiveWorkspaceId = useAppStore((state) => state.setActiveWorkspaceId);

  return (
    <ZilobaseFeaturesProvider
      value={{
        deployment: clientDeployment,
        cacheStorage: webClientCacheStorage,
        apiFetch,
        lifecycle: webClientLifecycle,
        databasePresenceColor,
        auth: webAuthClient,
        databaseRealtimeEnabled: !isHostedDemoRuntime(),
        preferredActiveWorkspaceId,
        queryClient,
        setPreferredActiveWorkspaceId,
      }}
    >
      {children}
    </ZilobaseFeaturesProvider>
  );
}

export function databasePresenceColor(value: string) {
  const colors = ["blue", "purple", "pink", "orange", "green", "yellow", "red", "brown"];
  let hash = 0;
  for (let index = 0; index < value.length; index++)
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return `var(--editor-${colors[hash % colors.length]})`;
}
