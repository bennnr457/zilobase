import type { Context } from "hono";
import type { ServerOperationContext } from "../../services/operations/context";
import type { AppBindings } from "../../shared/contracts/http";
import { getPinnedWorkspaceId } from "../auth/oauth/oauth-access";

/** Only verified middleware state can establish the application actor. */
export function serverOperationContext(c: Context<AppBindings>): ServerOperationContext {
  return {
    authentication: {
      apiKey: c.get("apiKey"),
      authMethod: c.get("authMethod"),
      oauthScopes: c.get("oauthScopes"),
      session: c.get("session"),
      user: c.get("user"),
    },
    activeWorkspaceId:
      c.get("session")?.activeWorkspaceId ??
      c.req.header("x-zilobase-workspace-id")?.trim() ??
      null,
    pinnedWorkspaceId: getPinnedWorkspaceId(c),
    env: c.env,
    policy: c.get("appPolicy"),
    editionExtension: c.get("editionExtension") ?? null,
    runtimePorts: c.get("runtimePorts"),
    requestId: c.get("requestId"),
    request: c.req.raw,
  };
}
