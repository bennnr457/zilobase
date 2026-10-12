import type { Page } from "./contracts";
import type { ApiFetcher } from "../shared/api-fetcher";
import { ApiError } from "../shared/api-error";
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
