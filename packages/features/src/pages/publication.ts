import type { Page } from "./contracts";
import type { ApiFetcher } from "../shared/api-fetcher";
import { ApiError } from "../shared/api-error";
import type { QueryClient } from "@tanstack/react-query";
import type { SessionResponse } from "../auth/contracts";
import type { PageDetail } from "./contracts";
import { resolvePageDetailReference, type PageDetailReference } from "./cache";
import { pageQueryKey, pageQueryOptions } from "./queries";

export type PageShareDecision = {
  type: "app" | "guest" | "public" | "login" | "onboarding" | "unavailable";
  memberDetail?: PageDetail;
  session?: SessionResponse;
};

export async function decidePageShareAccess(input: {
  apiFetch: ApiFetcher;
  queryClient: QueryClient;
  pageId: string;
  getSession: () => Promise<SessionResponse>;
  getWorkspaces: () => Promise<unknown[]>;
  isOnline: () => boolean;
}): Promise<PageShareDecision> {
  const { apiFetch, queryClient, pageId } = input;
  const session = await input.getSession();
  if (session.user && !input.isOnline()) {
    const detail = resolvePageDetailReference(
      queryClient,
      queryClient.getQueryData<PageDetailReference>(pageQueryKey(pageId)),
    );
    return { type: detail?.viewerType === "member" ? "app" : "unavailable" };
  }
  if (!session.user)
    return decidePublishedShareAccess({
      getSession: input.getSession,
      getWorkspaces: input.getWorkspaces,
      isPublished: () => isPagePublished(apiFetch, pageId),
    });
  try {
    const detail = await queryClient.fetchQuery({
      ...pageQueryOptions(apiFetch, pageId),
      staleTime: 0,
    });
    if (detail?.viewerType === "member")
      return {
        type: "app",
        session,
        memberDetail: resolvePageDetailReference(queryClient, detail)!,
      };
    if (detail?.viewerType === "guest") return { type: "guest" };
    if (detail?.viewerType === "public") return { type: "public" };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ActiveWorkspaceMismatchError"
    )
      return { type: "app" };
    throw error;
  }
  const workspaces = await input.getWorkspaces();
  return { type: workspaces.length === 0 ? "onboarding" : "app" };
}
export type PublishedShareDecision =
  | { type: "app" }
  | { type: "public" }
  | { type: "login" }
  | { type: "onboarding" };

export async function decidePublishedShareAccess(input: {
  getSession: () => Promise<{ user: unknown }>;
  getWorkspaces: () => Promise<unknown[]>;
  isPublished: () => Promise<boolean>;
}): Promise<PublishedShareDecision> {
  let session: { user: unknown };

  try {
    session = await input.getSession();
  } catch (error) {
    if (await publishedOrFalse(input.isPublished)) return { type: "public" };
    throw error;
  }

  if (!session.user) {
    return (await input.isPublished()) ? { type: "public" } : { type: "login" };
  }

  let workspaces: unknown[];

  try {
    workspaces = await input.getWorkspaces();
  } catch (error) {
    if (await publishedOrFalse(input.isPublished)) return { type: "public" };
    throw error;
  }

  if (workspaces.length === 0) return { type: "onboarding" };

  return { type: "app" };
}

async function publishedOrFalse(isPublished: () => Promise<boolean>) {
  try {
    return await isPublished();
  } catch {
    return false;
  }
}

export async function isPagePublished(apiFetch: ApiFetcher, pageId: string) {
  try {
    const result = await apiFetch<{ published: boolean }>(`/pages/${pageId}/published`, {
      auth: false,
      method: "GET",
    });

    return result.published;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw error;
  }
}

export function isPublishedFallbackPage(page: Page | null | undefined) {
  return Boolean(page?.publishedOwnerPreferences);
}
