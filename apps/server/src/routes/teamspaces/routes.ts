import { Hono } from "hono";
import {
  acceptTeamspaceInviteOperation,
  addTeamspacePrincipalOperation,
  createTeamspaceOperation,
  getTeamspaceOperation,
  getTeamspaceSettingsOperation,
  listTeamspacePrincipalsOperation,
  listTeamspacesOperation,
  removeTeamspacePrincipalOperation,
  setTeamspaceMembershipOperation,
  teamspaceLifecycleOperation,
  updateTeamspaceDefaultsOperation,
  updateTeamspaceInviteLinkOperation,
  updateTeamspaceOperation,
  updateTeamspacePrincipalOperation,
  updateTeamspaceSettingsOperation,
} from "../../services/teamspaces/operations";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

import type { AppBindings } from "../../shared/contracts/http";

export const teamspaceRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

teamspaceRoutes.get("/:workspaceId/teamspace-settings", async (c) =>
  c.json(
    await getTeamspaceSettingsOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);

teamspaceRoutes.patch("/:workspaceId/teamspace-settings", async (c) =>
  c.json(
    await updateTeamspaceSettingsOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")! },
      () => c.req.json(),
    ),
    200,
  ),
);

teamspaceRoutes.patch("/:workspaceId/teamspace-defaults", async (c) =>
  c.json(
    await updateTeamspaceDefaultsOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")! },
      () => c.req.json(),
    ),
    200,
  ),
);

teamspaceRoutes.get("/:workspaceId/teamspaces", async (c) =>
  c.json(
    await listTeamspacesOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      status: c.req.query("status"),
    }),
    200,
  ),
);

teamspaceRoutes.post("/:workspaceId/teamspaces", async (c) =>
  c.json(
    await createTeamspaceOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")! },
      () => c.req.json(),
    ),
    201,
  ),
);

teamspaceRoutes.get("/:workspaceId/teamspaces/:teamspaceId", async (c) =>
  c.json(
    await getTeamspaceOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      teamspaceId: c.req.param("teamspaceId")!,
    }),
    200,
  ),
);

teamspaceRoutes.patch("/:workspaceId/teamspaces/:teamspaceId", async (c) =>
  c.json(
    await updateTeamspaceOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")!, teamspaceId: c.req.param("teamspaceId")! },
      () => c.req.json(),
    ),
    200,
  ),
);

for (const action of ["join", "leave"] as const) {
  teamspaceRoutes.post(`/:workspaceId/teamspaces/:teamspaceId/${action}`, async (c) =>
    c.json(
      await setTeamspaceMembershipOperation(serverOperationContext(c), {
        action: action,
        workspaceId: c.req.param("workspaceId")!,
        teamspaceId: c.req.param("teamspaceId")!,
      }),
      200,
    ),
  );
}

for (const action of ["archive", "restore", "recover-owner"] as const) {
  teamspaceRoutes.post(`/:workspaceId/teamspaces/:teamspaceId/${action}`, async (c) =>
    c.json(
      await teamspaceLifecycleOperation(serverOperationContext(c), {
        action: action,
        workspaceId: c.req.param("workspaceId")!,
        teamspaceId: c.req.param("teamspaceId")!,
      }),
      200,
    ),
  );
}

teamspaceRoutes.patch("/:workspaceId/teamspaces/:teamspaceId/invite-link", async (c) =>
  c.json(
    await updateTeamspaceInviteLinkOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")!, teamspaceId: c.req.param("teamspaceId")! },
      () => c.req.json(),
    ),
    200,
  ),
);

teamspaceRoutes.post("/:workspaceId/teamspace-invites/:token/accept", async (c) =>
  c.json(
    await acceptTeamspaceInviteOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      token: c.req.param("token")!,
    }),
    200,
  ),
);

teamspaceRoutes.get("/:workspaceId/teamspaces/:teamspaceId/principals", async (c) =>
  c.json(
    await listTeamspacePrincipalsOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      teamspaceId: c.req.param("teamspaceId")!,
    }),
    200,
  ),
);

teamspaceRoutes.post("/:workspaceId/teamspaces/:teamspaceId/principals", async (c) =>
  c.json(
    await addTeamspacePrincipalOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")!, teamspaceId: c.req.param("teamspaceId")! },
      () => c.req.json(),
    ),
    200,
  ),
);

teamspaceRoutes.patch("/:workspaceId/teamspaces/:teamspaceId/principals/:principalId", async (c) =>
  c.json(
    await updateTeamspacePrincipalOperation(
      serverOperationContext(c),
      {
        workspaceId: c.req.param("workspaceId")!,
        principalId: c.req.param("principalId")!,
        teamspaceId: c.req.param("teamspaceId")!,
      },
      () => c.req.json(),
    ),
    200,
  ),
);

teamspaceRoutes.delete("/:workspaceId/teamspaces/:teamspaceId/principals/:principalId", async (c) =>
  c.json(
    await removeTeamspacePrincipalOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      principalId: c.req.param("principalId")!,
      teamspaceId: c.req.param("teamspaceId")!,
    }),
    200,
  ),
);
