import {
  getSearchSettingsOperation,
  updateSearchSettingsOperation,
  reindexSearchWorkspaceOperation,
} from "../../services/search/settings";
import { Hono } from "hono";
import {
  deleteWorkspaceOperation,
  getWorkspaceOperation,
  listWorkspacesOperation,
} from "../../services/workspaces/operations";
import type { AppBindings } from "../../shared/contracts/http";
import { requireOAuthScope } from "../auth/oauth/oauth-access";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";
import { postMemberInvitation } from "./invitations/handlers";
import { deleteMember, getAccessTargets, patchMember } from "./members/handlers";
import { patchWorkspaceSettings } from "./settings/handlers";

export const workspaceRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

workspaceRoutes.use("*", async (c, next) => {
  if (c.get("authMethod") !== "oauth") {
    await next();
    return;
  }

  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    return c.json(
      {
        error: "insufficient_scope",
        error_description: "OAuth tokens cannot change workspace membership.",
      },
      403,
    );
  }

  const denied = requireOAuthScope(c, "workspaces.read");
  if (denied) {
    return denied;
  }

  await next();
});

workspaceRoutes.get("/", async (c) =>
  c.json(await listWorkspacesOperation(serverOperationContext(c), {}), 200),
);

workspaceRoutes.get("/:workspaceId", async (c) =>
  c.json(
    await getWorkspaceOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);

workspaceRoutes.get("/:workspaceId/access-targets", getAccessTargets);

workspaceRoutes.post("/:workspaceId/member-invitations", postMemberInvitation);

workspaceRoutes.patch("/:workspaceId/members/:memberId", patchMember);

workspaceRoutes.delete("/:workspaceId/members/:memberId", deleteMember);

workspaceRoutes.patch("/:workspaceId", patchWorkspaceSettings);

workspaceRoutes.delete("/:workspaceId", async (c) =>
  c.json(
    await deleteWorkspaceOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")! },
      () => c.req.json(),
    ),
    200,
  ),
);

workspaceRoutes.get("/:workspaceId/search/settings", async (c) =>
  c.json(
    await getSearchSettingsOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);
workspaceRoutes.patch("/:workspaceId/search/settings", async (c) =>
  c.json(
    await updateSearchSettingsOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")! },
      () => c.req.json(),
    ),
    200,
  ),
);
workspaceRoutes.post("/:workspaceId/search/reindex", async (c) =>
  c.json(
    await reindexSearchWorkspaceOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);
