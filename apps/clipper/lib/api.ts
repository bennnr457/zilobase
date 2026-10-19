import { createZilobaseClient, type ApiFetcher } from "@zilobase/features";
import {
  createClip as createClipOperation,
  type CreateClipRequest,
} from "@zilobase/features/clips";
import { browser } from "wxt/browser";
import { refreshClipperAccessToken } from "./oauth";
import type { ClipperSession } from "./session";

/** An isolated command runtime owns no retained UI cache and is always disposed. */
export async function createClip(session: ClipperSession, input: CreateClipRequest) {
  const runtime = createZilobaseClient({ deployment: session.instanceUrl });
  try {
    return await createClipOperation(
      { queryClient: runtime.queryClient, apiFetch: createClipperApiFetcher(session) },
      input,
    );
  } finally {
    runtime.dispose();
  }
}

/** Auth recovery is an extension transport concern; mutations have no general retry policy. */
export function createClipperApiFetcher(
  session: ClipperSession,
  ports: { fetch: typeof fetch; refresh: (session: ClipperSession) => Promise<ClipperSession> } = {
    fetch: globalThis.fetch,
    refresh: refreshClipperAccessToken,
  },
): ApiFetcher {
  return async <T>(path: string, init?: RequestInit) => {
    const send = (current: ClipperSession) =>
      ports.fetch(new URL(path, current.instanceUrl), {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers)),
          Authorization: `Bearer ${current.token}`,
          "Content-Type": "application/json",
          "x-zilobase-workspace-id": current.workspaceId,
        },
      });
    let response = await send(session);
    if (response.status === 401 && session.refreshToken)
      response = await send(await ports.refresh(session));
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Save failed (${response.status})`);
    }
    return (await response.json()) as T;
  };
}

export function openClippedPage(session: ClipperSession, path: string) {
  const url = new URL(path, session.webOrigin ?? session.instanceUrl);
  void browser.tabs.create({ url: url.toString() });
}
