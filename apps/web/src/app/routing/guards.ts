import { resolveActiveWorkspaceId } from "@zilobase/features/workspaces";
import { decidePageShareAccess } from "@zilobase/features/pages";
import { isDatabasePublished as readDatabasePublished } from "@zilobase/features/databases";
import { redirect } from "@tanstack/react-router";
import { pagesQueryOptions } from "@zilobase/features/pages";
import { sessionQueryOptions, type SessionResponse } from "@zilobase/features/auth";
import { workspacesQueryOptions } from "@zilobase/features/workspaces";

import { queryClient } from "@/app/query-client";
import { webAuthClient } from "@/app/providers/features-provider";
import { useAppStore } from "@/features/desktop/state/app-store";
import { NetworkUnavailableError, apiFetch } from "@/platform/network/api";
import { getMostRecentItemPath } from "@/features/library/library-model";
import { decidePublishedShareAccess } from "@zilobase/features/pages";
import { getConnectivityState } from "@/platform/network/connectivity";
import { hydratePageReadCache } from "@/features/pages/cache/page-read-cache";
import { resolveNavigationReference, type PageDetail } from "@zilobase/features/pages";

const NAVIGATION_AUTH_STALE_TIME = 30_000;

export async function applyPageShareAccess(pageId: string) {
  const decision = await decidePageShareAccess({
    apiFetch,
    queryClient,
    pageId,
    getSession: () => getFreshSession({ optional: true }),
    getWorkspaces,
    isOnline: () => getConnectivityState() !== "offline",
  });
  if (decision.type === "unavailable") throw new NetworkUnavailableError();
  if (decision.type === "login") throw redirect({ to: "/login" });
  if (decision.type === "onboarding") throw redirect({ to: "/onboarding" });
  if (decision.session)
    await hydrateCachedPageQueries(decision.session, pageId, decision.memberDetail!);
  return decision.type;
}

async function hydrateCachedPageQueries(
  session: SessionResponse,
  pageId: string,
  detail: PageDetail,
) {
  if (!session.user) return;
  await hydratePageReadCache({
    queryClient,
    userId: session.user.id,
    sessionId: session.session?.id ?? "public",
    pageId,
    workspaceId: detail.page.workspaceId,
    databaseIds: detail.databaseIds ?? [],
  }).catch(() => undefined);
}

export function applyDatabaseShareAccess(databaseId: string) {
  return applyPublishedShareAccess(() => readDatabasePublished(apiFetch, databaseId));
}

export async function getFreshSession(options?: { optional?: boolean }) {
  try {
    return await queryClient.fetchQuery({
      ...sessionQueryOptions(webAuthClient),
      staleTime: NAVIGATION_AUTH_STALE_TIME,
    });
  } catch (error) {
    if (options?.optional && error instanceof NetworkUnavailableError) {
      return { session: null, user: null };
    }
    throw error;
  }
}

export async function getWorkspaces() {
  try {
    return await queryClient.fetchQuery({
      ...workspacesQueryOptions(webAuthClient),
      staleTime: NAVIGATION_AUTH_STALE_TIME,
    });
  } catch (error) {
    throw error;
  }
}

export async function getDefaultAppPath(
  session: Awaited<ReturnType<typeof getFreshSession>>,
  workspaces: Awaited<ReturnType<typeof getWorkspaces>>,
) {
  const preferredWorkspaceId = useAppStore.getState().activeWorkspaceId;
  const sessionWorkspaceId = session.session?.activeWorkspaceId ?? null;
  const workspaceId = resolveActiveWorkspaceId({
    preferredActiveWorkspaceId: preferredWorkspaceId,
    sessionWorkspaceId,
    workspaces,
    status: "success",
  });

  if (!workspaceId) return "/recents";

  const options = pagesQueryOptions(apiFetch, workspaceId);

  try {
    const navigation = await queryClient.fetchQuery({
      ...options,
      staleTime: NAVIGATION_AUTH_STALE_TIME,
    });

    return navigation
      ? (getMostRecentItemPath(resolveNavigationReference(queryClient, navigation)) ?? "/recents")
      : "/recents";
  } catch {
    return "/recents";
  }
}

async function applyPublishedShareAccess(isPublished: () => Promise<boolean>) {
  const decision = await decidePublishedShareAccess({
    getSession: () => getFreshSession({ optional: true }),
    getWorkspaces,
    isPublished,
  });

  if (decision.type === "login") {
    throw redirect({ to: "/login" });
  }

  if (decision.type === "onboarding") {
    throw redirect({ to: "/onboarding" });
  }

  return decision.type;
}
