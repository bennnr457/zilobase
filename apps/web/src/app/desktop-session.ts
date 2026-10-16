import { Effect } from "effect";
import { getApiRequestHeaders } from "@/platform/network/api";
import {
  forgetDesktopAuthCredentials,
  getDesktopAuthToken,
} from "@/platform/auth/desktop-auth-token";
import {
  beginDesktopServerNetworkShutdown,
  desktopNetworkFetch,
} from "@/platform/network/desktop-network";
import { clearIndexedDataForServer } from "@/platform/storage/indexed-data-cleanup";
import { queryClient } from "@/app/query-client";
import {
  commitDesktopServerCandidate,
  getSelectedDesktopServer,
  resolveDesktopServerSwitchPath,
  switchDesktopServerProfile,
  type DesktopServer,
} from "@/platform/server/desktop-server";
import type { DesktopServerSwitchRequest } from "@/platform/server/operations/desktop-server-switch";
import type { DesktopServerReplacementDependencies } from "@/platform/server/operations/desktop-server-replacement-core";
import { useAppStore } from "@/app/state/app-store";
import { useAuthFlowStore } from "@/sections/auth/hooks/auth-flow-store";
import { clearPageSnapshotsForDeployment } from "@/platform/storage/client-cache-storage";
import { sessionQueryKey, type SessionResponse } from "@zilobase/features/auth";

export function switchDesktopServerSession(request: DesktopServerSwitchRequest) {
  return Effect.runPromise(
    Effect.gen(function* () {
      beginDesktopServerNetworkShutdown();
      yield* Effect.tryPromise({ try: () => queryClient.cancelQueries(), catch: (error) => error });

      if (request.candidateId) {
        const candidateId = request.candidateId;
        yield* Effect.tryPromise({
          try: () => commitDesktopServerCandidate(candidateId),
          catch: (error) => error,
        });
      } else {
        yield* Effect.tryPromise({
          try: () =>
            switchDesktopServerProfile({
              apiOrigin: request.server.apiOrigin,
              instanceId: request.server.instanceId,
              path: request.path,
              workspaceId: request.workspaceId,
            }),
          catch: (error) => error,
        });
      }

      forgetDesktopAuthCredentials();
      const path = resolveDesktopServerSwitchPath(request);
      if (typeof window !== "undefined") window.location.replace(path);
      return path;
    }),
  );
}

export function createDesktopServerReplacementDependencies(input: {
  beforeLocalCleanup: () => Promise<void>;
  reload: (path: string) => void;
}): DesktopServerReplacementDependencies {
  return {
    beforeLocalCleanup: input.beforeLocalCleanup,
    beginNetworkShutdown: beginDesktopServerNetworkShutdown,
    cancelQueries: () => queryClient.cancelQueries(),
    clearIndexedData: () => clearIndexedDataForServer(getSelectedDesktopServer()),
    clearStores: clearDesktopServerBrowserState,
    commitCandidate: commitDesktopServerCandidate,
    forgetCredentials: forgetDesktopAuthCredentials,
    reload: input.reload,
    revokeOldSession: bestEffortRevokeDesktopSession,
  };
}

function clearDesktopServerBrowserState() {
  return Effect.runPromise(
    Effect.gen(function* () {
      const userId = queryClient.getQueryData<SessionResponse>(sessionQueryKey)?.user?.id;
      if (userId) {
        yield* Effect.tryPromise({
          try: () => clearPageSnapshotsForDeployment(userId),
          catch: (error) => error,
        });
      }
      queryClient.clear();
      useAppStore.getState().resetAccountState();
      useAuthFlowStore.getState().clearAuthFlow();
      yield* Effect.tryPromise({
        try: () =>
          Promise.all([
            useAppStore.persist.clearStorage(),
            useAuthFlowStore.persist.clearStorage(),
          ]),
        catch: (error) => error,
      });
      window.localStorage.removeItem("zilobase-app");
      window.localStorage.removeItem("zilobase-auth-flow");
      const server = getSelectedDesktopServer();
      if (server) {
        window.localStorage.removeItem(`zilobase-app:${server.instanceId}`);
        window.localStorage.removeItem(`zilobase-auth-flow:${server.instanceId}`);
      }
      window.sessionStorage.clear();
    }),
  );
}

function bestEffortRevokeDesktopSession(server: DesktopServer) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const token = getDesktopAuthToken();
      if (!token) return;

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3_000);
      yield* Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () =>
            desktopNetworkFetch(`${server.apiOrigin}/api/auth/sign-out`, {
              body: "{}",
              credentials: "include",
              headers: getApiRequestHeaders({ "content-type": "application/json" }),
              method: "POST",
              signal: controller.signal,
            }),
          catch: (error) => error,
        });
        yield* Effect.tryPromise({ try: () => response.arrayBuffer(), catch: (error) => error });
      }).pipe(Effect.ensuring(Effect.sync(() => window.clearTimeout(timeout))));
    }),
  );
}
