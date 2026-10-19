import type { Context } from "hono";

import type { AppBindings } from "../../shared/contracts/http";

function getApiKeyWorkspaceId(c: Context<AppBindings>) {
  return c.get("apiKey")?.workspaceId ?? null;
}

export function rejectMismatchedApiKeyWorkspace(
  c: Context<AppBindings>,
  workspaceId: string | null | undefined,
) {
  const pinnedWorkspaceId = getApiKeyWorkspaceId(c);

  if (!pinnedWorkspaceId || !workspaceId) {
    return null;
  }

  if (workspaceId === pinnedWorkspaceId) {
    return null;
  }

  return c.json(
    {
      error: "Forbidden",
      message: "API keys can only access the workspace they were created for.",
    },
    403,
  );
}
