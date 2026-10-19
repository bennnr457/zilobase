import type { Handler } from "hono";
import {
  getWorkspaceAccessTargetsOperation,
  removeWorkspaceMemberOperation,
  updateWorkspaceMemberOperation,
} from "../../../services/workspaces/members/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
export const getAccessTargets: Handler<AppBindings, "/:workspaceId/access-targets"> = async (c) =>
  c.json(
    await getWorkspaceAccessTargetsOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
    }),
    200,
  );
export const patchMember: Handler<AppBindings, "/:workspaceId/members/:memberId"> = async (c) =>
  c.json(
    await updateWorkspaceMemberOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")!, memberId: c.req.param("memberId")! },
      () => c.req.json(),
    ),
    200,
  );
export const deleteMember: Handler<AppBindings, "/:workspaceId/members/:memberId"> = async (c) =>
  c.json(
    await removeWorkspaceMemberOperation(serverOperationContext(c), {
      workspaceId: c.req.param("workspaceId")!,
      memberId: c.req.param("memberId")!,
    }),
    200,
  );
