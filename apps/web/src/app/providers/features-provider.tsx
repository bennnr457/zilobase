import { webChatReceipts } from "@/platform/storage/chat-receipts";
import { Cause, Effect } from "effect";
import {
  ZilobaseFeaturesProvider,
  type ZilobaseAuthClient,
  rememberClientSession,
} from "@zilobase/features";
import type { Workspace } from "@zilobase/features/workspaces";
import { createApiAuthClient, type SessionResponse } from "@zilobase/features/auth";
import { apiFetch, apiStreamFetch, clearApiAuthToken } from "@/platform/network/api";
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/platform/diagnostics/desktop-diagnostics";
import { clientDeployment, queryClient } from "@/app/query-client";
import { useAppStore } from "@/app/state/app-store";
import { isHostedDemoRuntime, requestDemoGuard } from "@/app/demo/runtime";
import posthog from "@/platform/analytics/posthog";
import { readOAuthQuery } from "@zilobase/features/oauth";
import { clearPageCacheForUser } from "@/sections/pages/editor/collaboration/lib/page-document-cache";
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
    return Effect.runPromise(
      Effect.gen(function* () {
        const session = yield* Effect.tryPromise({
          try: () => apiFetch<SessionResponse>("/session", { signal, timeoutMs: 15_000 }),
          catch: (error) => error,
        });
        const write = rememberClientSession(webClientCacheStorage, clientDeployment(), session);
        yield* Effect.tryPromise({ try: () => write, catch: (error) => error }).pipe(Effect.ignore);
        recordDesktopDiagnostic("session.request", {
          duration_ms: performance.now() - startedAt,
          session_present: Boolean(session.session),
          status: "success",
          user_present: Boolean(session.user),
        });
        return session;
      }).pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
          const error = Cause.squash(cause);
          return Effect.gen(function* () {
            if (getConnectivityState() === "offline") {
              const read = readCachedSession();
              const cached = yield* Effect.tryPromise({
                try: () => read,
                catch: (error) => error,
              }).pipe(Effect.orElseSucceed(() => null));
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
            return yield* Effect.fail(error);
          });
        }),
      ),
    );
  },
  requestSignInOtp: (email) => runAuthCommand(() => apiAuthClient.requestSignInOtp(email)),
  signInWithOtp: (input) =>
    runAuthCommand(() => apiAuthClient.signInWithOtp(withOAuthQuery({ ...input }))),
  signInWithPassword: (input) =>
    runAuthCommand(() => apiAuthClient.signInWithPassword(withOAuthQuery({ ...input }))),
  signUp: (input) =>
    runAuthCommand(() =>
      apiAuthClient.signUp({
        ...input,
        callbackURL:
          input.callbackURL ??
          (input.invitationId
            ? `/accept-invitation?id=${encodeURIComponent(input.invitationId)}`
            : "/onboarding"),
      }),
    ),
  requestEmailVerificationOtp: (email) =>
    runAuthCommand(() => apiAuthClient.requestEmailVerificationOtp(email)),
  verifyEmailOtp: (input) => runAuthCommand(() => apiAuthClient.verifyEmailOtp(input)),
  signOut: () =>
    Effect.runPromise(
      Effect.gen(function* () {
        if (isHostedDemoRuntime()) return yield* Effect.fail(requestDemoGuard());
        const previousSession = yield* Effect.tryPromise({
          try: () => readCachedSession(),
          catch: (error) => error,
        });
        const result = yield* Effect.tryPromise({
          try: () => apiAuthClient.signOut(),
          catch: (error) => error,
        });
        yield* Effect.tryPromise({ try: () => clearCachedSession(), catch: (error) => error });
        if (previousSession?.user) {
          const userId = previousSession.user.id;
          yield* Effect.tryPromise({
            try: () => clearPageCacheForUser(userId),
            catch: (error) => error,
          });
        }
        posthog?.reset();
        yield* Effect.tryPromise({ try: () => clearApiAuthToken(), catch: (error) => error });
        useAppStore.getState().resetAccountState();
        return result;
      }),
    ),
  createWorkspace: <TWorkspace,>(input: { name: string; slug: string }) =>
    runAuthCommand(() => apiAuthClient.createWorkspace<TWorkspace>(input)),
  setActiveWorkspace: (workspaceId) =>
    runAuthCommand(() => apiAuthClient.setActiveWorkspace(workspaceId)),
  inviteWorkspaceMember: (input) =>
    runAuthCommand(() => apiAuthClient.inviteWorkspaceMember(input)),
  acceptWorkspaceInvitation: <TResponse,>(input: { invitationId: string }) =>
    runAuthCommand(() => apiAuthClient.acceptWorkspaceInvitation<TResponse>(input)),
  listWorkspaces: <TWorkspace,>(signal?: AbortSignal) =>
    isHostedDemoRuntime()
      ? Effect.runPromise(
          Effect.tryPromise({
            try: () =>
              apiFetch<{ workspace: Workspace }>("/demo/bootstrap", { method: "GET", signal }),
            catch: (error) => error,
          }).pipe(Effect.map(({ workspace }) => [workspace] as TWorkspace[])),
        )
      : apiAuthClient.listWorkspaces<TWorkspace>(signal),
  listWorkspaceInvitations: <TInvitation,>(workspaceId: string, signal?: AbortSignal) =>
    isHostedDemoRuntime()
      ? Promise.resolve([])
      : apiAuthClient.listWorkspaceInvitations<TInvitation>(workspaceId, signal),
};

function runAuthCommand<T>(command: () => Promise<T>): Promise<T> {
  if (isHostedDemoRuntime()) return Effect.runPromise(Effect.fail(requestDemoGuard()));
  // Start the existing Promise port before bridging so synchronous throws retain their behavior.
  const request = command();
  return Effect.runPromise(Effect.tryPromise({ try: () => request, catch: (error) => error }));
}

export function WebFeaturesProvider({ children }: React.PropsWithChildren) {
  const preferredActiveWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const setPreferredActiveWorkspaceId = useAppStore((state) => state.setActiveWorkspaceId);

  return (
    <ZilobaseFeaturesProvider
      value={{
        deployment: clientDeployment,
        cacheStorage: webClientCacheStorage,
        chatReceipts: webChatReceipts,
        apiFetch,
        streamFetch: apiStreamFetch,
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
