import type { Handler } from "hono";
import { updateWorkspaceOperation } from "../../../services/workspaces/settings/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
export const patchWorkspaceSettings: Handler<AppBindings, "/:workspaceId"> = async (c) =>
  c.json(
    await updateWorkspaceOperation(
      serverOperationContext(c),
      { workspaceId: c.req.param("workspaceId")! },
      () => c.req.json(),
    ),
    200,
  );
