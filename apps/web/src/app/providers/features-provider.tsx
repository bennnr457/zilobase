import {
  ZilobaseFeaturesProvider,
  type ZilobaseAuthClient,
  rememberClientSession,
} from "@zilobase/features";
import type {
  AcceptWorkspaceInvitationResponse,
  Workspace,
  WorkspaceInvitation,
  WorkspaceRole,
} from "@zilobase/features/workspaces";
import type {
  SessionResponse,
  SignInWithOtpInput,
  SignInWithPasswordInput,
  SignUpInput,
  VerifyEmailOtpInput,
} from "@zilobase/features/auth";
import { apiFetch, authFetch, clearApiAuthToken } from "@/platform/network/api";
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/features/desktop/diagnostics/index";
import { clientDeployment, queryClient } from "@/app/query-client";
import { useAppStore } from "@/features/desktop/state/app-store";
import { isHostedDemoRuntime, requestDemoGuard } from "@/features/demo";
import posthog from "@/shared/lib/posthog";
import { readOAuthQuery } from "@zilobase/features/oauth";
import { clearPageCacheForUser } from "@/features/editor/collaboration/page-document-cache";
import {
  clearCachedSession,
  readCachedSession,
  webClientCacheStorage,
} from "@/platform/storage/client-cache-storage";
import { getConnectivityState } from "@/platform/network/connectivity";
import type { ClientLifecycle } from "@zilobase/features";
function withOAuthQuery<T extends Record<string, unknown>>(input: T) {
  if (typeof window === "undefined") {
    return input;
  }

  const oauthQuery = readOAuthQuery(window.location.search);
  return oauthQuery ? { ...input, oauth_query: oauthQuery } : input;
}

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
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ success: boolean }>("/email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        }),
  signInWithOtp: (input: SignInWithOtpInput) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ token: string; user: unknown }>(
          "/sign-in/email-otp",
          withOAuthQuery({ ...input }),
        ),
  signInWithPassword: (input: SignInWithPasswordInput) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ token: string; user: unknown }>("/sign-in/email", withOAuthQuery({ ...input })),
  signUp: (input: SignUpInput) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ user: unknown }>("/sign-up/email", {
          ...input,
          callbackURL:
            input.callbackURL ??
            (input.invitationId
              ? `/accept-invitation?id=${encodeURIComponent(input.invitationId)}`
              : "/onboarding"),
        }),
  requestEmailVerificationOtp: (email) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ success: boolean }>("/email-otp/send-verification-otp", {
          email,
          type: "email-verification",
        }),
  verifyEmailOtp: (input: VerifyEmailOtpInput) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch<{ user: unknown }>("/email-otp/verify-email", input),
  signOut: async () => {
    if (isHostedDemoRuntime()) throw requestDemoGuard();
    const previousSession = await readCachedSession();
    const result = await authFetch("/sign-out", {});
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
      : (authFetch<Workspace>("/workspace/create", input) as Promise<TWorkspace>),
  setActiveWorkspace: (workspaceId: string) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch("/workspace/set-active", { workspaceId }),
  inviteWorkspaceMember: (input: { email: string; workspaceId: string; role: string }) =>
    isHostedDemoRuntime()
      ? rejectDemoAction()
      : authFetch("/workspace/invite-member", {
          ...input,
          role: input.role as WorkspaceRole,
        }),
  acceptWorkspaceInvitation: <TResponse,>(input: { invitationId: string }) =>
    isHostedDemoRuntime()
      ? rejectDemoAction<TResponse>()
      : (authFetch<AcceptWorkspaceInvitationResponse>(
          "/workspace/accept-invitation",
          input,
        ) as Promise<TResponse>),
  listWorkspaces: <TWorkspace,>(signal?: AbortSignal) =>
    isHostedDemoRuntime()
      ? apiFetch<{ workspace: Workspace }>("/demo/bootstrap", {
          method: "GET",
          signal,
        }).then(({ workspace }) => [workspace] as TWorkspace[])
      : (apiFetch<Workspace[]>("/api/auth/workspace/list", {
          method: "GET",
          signal,
        }) as Promise<TWorkspace[]>),
  listWorkspaceInvitations: <TInvitation,>(workspaceId: string, signal?: AbortSignal) =>
    isHostedDemoRuntime()
      ? Promise.resolve([])
      : (apiFetch<WorkspaceInvitation[]>(
          `/api/auth/workspace/list-invitations?workspaceId=${encodeURIComponent(workspaceId)}`,
          {
            method: "GET",
            signal,
          },
        ) as Promise<TInvitation[]>),
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

export const webClientLifecycle: ClientLifecycle = {
  isOnline: () => navigator.onLine !== false,
  isVisible: () => document.visibilityState !== "hidden",
  subscribe(listener) {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    document.addEventListener("visibilitychange", listener);
    return () => {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
      document.removeEventListener("visibilitychange", listener);
    };
  },
};

export function databasePresenceColor(value: string) {
  const colors = ["blue", "purple", "pink", "orange", "green", "yellow", "red", "brown"];
  let hash = 0;
  for (let index = 0; index < value.length; index++)
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return `var(--editor-${colors[hash % colors.length]})`;
}
