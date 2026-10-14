import { Effect } from "effect";
import { redirect } from "@tanstack/react-router";
import { isDatabasePublished as readDatabasePublished } from "@zilobase/features/databases";
import { sessionQueryOptions, type SessionResponse } from "@zilobase/features/auth";
import {
  decidePageShareAccess,
  decidePublishedShareAccess,
  pagesQueryOptions,
  resolveNavigationReference,
  type PageDetail,
} from "@zilobase/features/pages";
import {
  resolveActiveWorkspaceId,
  workspacesQueryOptions,
  type Workspace,
} from "@zilobase/features/workspaces";

import { queryClient } from "@/app/query-client";
import { webAuthClient } from "@/app/providers/features-provider";
import { useAppStore } from "@/app/state/app-store";
import { NetworkUnavailableError, apiFetch } from "@/platform/network/api";
import { getMostRecentItemPath } from "@/components/library/library-model";
import { getConnectivityState } from "@/platform/network/connectivity";
import { hydratePageReadCache } from "@/components/pages/cache/page-read-cache";

const NAVIGATION_AUTH_STALE_TIME = 30_000;

export function applyPageShareAccess(pageId: string) {
  return Effect.gen(function* () {
    const decision = yield* Effect.tryPromise({
      try: () =>
        decidePageShareAccess({
          apiFetch,
          queryClient,
          pageId,
          getSession: () => Effect.runPromise(getFreshSession({ optional: true })),
          getWorkspaces: () => Effect.runPromise(getWorkspaces()),
          isOnline: () => getConnectivityState() !== "offline",
        }),
      catch: (error) => error,
    });
    if (decision.type === "unavailable") return yield* Effect.fail(new NetworkUnavailableError());
    if (decision.type === "login") return yield* Effect.fail(redirect({ to: "/login" }));
    if (decision.type === "onboarding") return yield* Effect.fail(redirect({ to: "/onboarding" }));
    if (decision.session) {
      yield* hydrateCachedPageQueries(decision.session, pageId, decision.memberDetail!);
    }
    return decision.type;
  });
}

function hydrateCachedPageQueries(session: SessionResponse, pageId: string, detail: PageDetail) {
  if (!session.user) return Effect.void;
  const input = {
    queryClient,
    userId: session.user.id,
    sessionId: session.session?.id ?? "public",
    pageId,
    workspaceId: detail.page.workspaceId,
    databaseIds: detail.databaseIds ?? [],
  };
  return Effect.tryPromise({
    try: () => hydratePageReadCache(input),
    catch: (error) => error,
  }).pipe(Effect.ignore);
}

export function applyDatabaseShareAccess(databaseId: string) {
  return applyPublishedShareAccess(() => readDatabasePublished(apiFetch, databaseId));
}

export function getFreshSession(options?: { optional?: boolean }) {
  return Effect.tryPromise({
    try: () =>
      queryClient.fetchQuery({
        ...sessionQueryOptions(webAuthClient),
        staleTime: NAVIGATION_AUTH_STALE_TIME,
      }),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) =>
      options?.optional && error instanceof NetworkUnavailableError
        ? Effect.succeed({ session: null, user: null })
        : Effect.fail(error),
    ),
  );
}

export function getWorkspaces() {
  return Effect.tryPromise({
    try: () =>
      queryClient.fetchQuery({
        ...workspacesQueryOptions(webAuthClient),
        staleTime: NAVIGATION_AUTH_STALE_TIME,
      }),
    catch: (error) => error,
  });
}

export function getDefaultAppPath(session: SessionResponse, workspaces: Workspace[]) {
  return Effect.suspend(() => {
    const workspaceId = resolveActiveWorkspaceId({
      preferredActiveWorkspaceId: useAppStore.getState().activeWorkspaceId,
      sessionWorkspaceId: session.session?.activeWorkspaceId ?? null,
      workspaces,
      status: "success",
    });
    if (!workspaceId) return Effect.succeed("/recents");
    const options = pagesQueryOptions(apiFetch, workspaceId);
    return Effect.tryPromise({
      try: async () => {
        const navigation = await queryClient.fetchQuery({
          ...options,
          staleTime: NAVIGATION_AUTH_STALE_TIME,
        });
        return navigation
          ? (getMostRecentItemPath(resolveNavigationReference(queryClient, navigation)) ??
              "/recents")
          : "/recents";
      },
      catch: (error) => error,
    }).pipe(Effect.orElseSucceed(() => "/recents"));
  });
}

function applyPublishedShareAccess(isPublished: () => Promise<boolean>) {
  return Effect.gen(function* () {
    const decision = yield* Effect.tryPromise({
      try: () =>
        decidePublishedShareAccess({
          getSession: () => Effect.runPromise(getFreshSession({ optional: true })),
          getWorkspaces: () => Effect.runPromise(getWorkspaces()),
          isPublished,
        }),
      catch: (error) => error,
    });
    if (decision.type === "login") return yield* Effect.fail(redirect({ to: "/login" }));
    if (decision.type === "onboarding") return yield* Effect.fail(redirect({ to: "/onboarding" }));
    return decision.type;
  });
}
