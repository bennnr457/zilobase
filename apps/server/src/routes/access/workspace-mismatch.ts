import type { Context } from "hono";
import { getMembership } from "../../services/access/principal-access";
import type { AppBindings } from "../../shared/contracts/http";

const ACTIVE_ORGANIZATION_MISMATCH_CODE = "ACTIVE_ORGANIZATION_MISMATCH";

function activeWorkspaceMismatchResponse(c: Context<AppBindings>, workspaceId: string) {
  return c.json(
    {
      code: ACTIVE_ORGANIZATION_MISMATCH_CODE,
      error: "Switch to the page workspace to continue.",
      workspaceId,
    },
    409,
  );
}

export async function rejectActiveWorkspaceMismatch(
  c: Context<AppBindings>,
  pageWorkspaceId: string,
  userId: string,
) {
  const activeWorkspaceId = c.get("session")?.activeWorkspaceId ?? null;

  if (!activeWorkspaceId || activeWorkspaceId === pageWorkspaceId) {
    return null;
  }

  if (!(await getMembership(pageWorkspaceId, userId))) {
    return null;
  }

  return activeWorkspaceMismatchResponse(c, pageWorkspaceId);
}
