import type { Context } from "hono";
import { Hono } from "hono";
import { ServerOperationError } from "../../services/operations/context";
import {
  acceptPageGuestInvitationOperation,
  cancelPageGuestInvitationOperation,
  getPageGuestInvitationOperation,
  invitePageGuestOperation,
  listPageGuestInvitationsOperation,
  listPageGuestRequestsOperation,
  revokePageGuestOperation,
} from "../../services/page-guests/operations";
import {
  approveWorkspaceGuestRequestOperation,
  getWorkspaceGuestPolicyOperation,
  listWorkspaceGuestRequestsOperation,
  listWorkspaceGuestsOperation,
  promoteWorkspaceGuestOperation,
  rejectWorkspaceGuestRequestOperation,
  revokeWorkspaceGuestOperation,
  updateWorkspaceGuestPolicyOperation,
} from "../../services/page-guests/workspace/operations";
import { serverOperationContext } from "../http/operation-context";
import { readJsonBody } from "../http/request";
import { attachServiceErrorHandler, httpRouteErrorResponse } from "../http/route-error";

import { PageGuestServiceError } from "../../services/page-guests/policy";
import type { AppBindings } from "../../shared/contracts/http";

export const pageGuestRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

pageGuestRoutes.post("/pages/:pageId/guest-invitations", async (c) => {
  try {
    const result = await invitePageGuestOperation(
      serverOperationContext(c),
      { pageId: c.req.param("pageId"), body: undefined },
      () => readJsonBody(c.req),
    );
    return result.kind === "request"
      ? c.json({ request: result.request }, 202)
      : c.json({ invitation: result.invitation }, 201);
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});
pageGuestRoutes.get("/pages/:pageId/guest-requests", async (c) => {
  try {
    return c.json(
      await listPageGuestRequestsOperation(serverOperationContext(c), {
        pageId: c.req.param("pageId"),
      }),
    );
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});
pageGuestRoutes.get("/pages/:pageId/guest-invitations", async (c) => {
  try {
    return c.json(
      await listPageGuestInvitationsOperation(serverOperationContext(c), {
        pageId: c.req.param("pageId"),
      }),
    );
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});
pageGuestRoutes.delete("/pages/:pageId/guest-invitations/:invitationId", async (c) => {
  try {
    return c.json(
      await cancelPageGuestInvitationOperation(serverOperationContext(c), {
        pageId: c.req.param("pageId"),
        invitationId: c.req.param("invitationId"),
      }),
    );
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});
pageGuestRoutes.delete("/pages/:pageId/guests/:userId", async (c) => {
  try {
    return c.json(
      await revokePageGuestOperation(serverOperationContext(c), {
        pageId: c.req.param("pageId"),
        targetUserId: c.req.param("userId"),
      }),
    );
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});
pageGuestRoutes.get("/page-guest-invitations/:invitationId", async (c) => {
  try {
    return c.json(
      await getPageGuestInvitationOperation(serverOperationContext(c), {
        invitationId: c.req.param("invitationId"),
      }),
    );
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});
pageGuestRoutes.post("/page-guest-invitations/:invitationId/accept", async (c) => {
  try {
    return c.json(
      await acceptPageGuestInvitationOperation(serverOperationContext(c), {
        invitationId: c.req.param("invitationId"),
      }),
    );
  } catch (error) {
    return pageGuestErrorResponse(c, error);
  }
});

pageGuestRoutes.get("/workspaces/:workspaceId/guests", async (c) =>
  c.json(
    await listWorkspaceGuestsOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);

pageGuestRoutes.get("/workspaces/:workspaceId/guest-policy", async (c) =>
  c.json(
    await getWorkspaceGuestPolicyOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);

pageGuestRoutes.patch("/workspaces/:workspaceId/guest-policy", async (c) =>
  c.json(
    await updateWorkspaceGuestPolicyOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")! },
      () => c.req.json(),
    ),
    200,
  ),
);

pageGuestRoutes.get("/workspaces/:workspaceId/guest-requests", async (c) =>
  c.json(
    await listWorkspaceGuestRequestsOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);

pageGuestRoutes.post("/workspaces/:workspaceId/guest-requests/:requestId/reject", async (c) =>
  c.json(
    await rejectWorkspaceGuestRequestOperation(serverOperationContext(c), {
      requestId: c.req.param("requestId")!,
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);

pageGuestRoutes.post("/workspaces/:workspaceId/guest-requests/:requestId/approve", async (c) =>
  c.json(
    await approveWorkspaceGuestRequestOperation(serverOperationContext(c), {
      requestId: c.req.param("requestId")!,
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  ),
);

pageGuestRoutes.delete("/workspaces/:workspaceId/guests/:userId", async (c) =>
  c.json(
    await revokeWorkspaceGuestOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      userId: c.req.param("userId")!,
    }),
    200,
  ),
);

pageGuestRoutes.post("/workspaces/:workspaceId/guests/:userId/promote", async (c) =>
  c.json(
    await promoteWorkspaceGuestOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      userId: c.req.param("userId")!,
    }),
    200,
  ),
);

function pageGuestErrorResponse(c: Context<AppBindings>, error: unknown) {
  if (error instanceof ServerOperationError) return httpRouteErrorResponse(c, error)!;
  if (error instanceof PageGuestServiceError) {
    return c.json({ error: error.message }, error.status);
  }

  throw error;
}
