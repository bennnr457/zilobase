import type { Handler } from "hono";
import { inviteWorkspaceMemberOperation } from "../../../services/workspaces/invitations/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
export const postMemberInvitation: Handler<
  AppBindings,
  "/:workspaceId/member-invitations"
> = async (c) =>
  c.json(
    await inviteWorkspaceMemberOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")! },
      () => c.req.json(),
    ),
    201,
  );
