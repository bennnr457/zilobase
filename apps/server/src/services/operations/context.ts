import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import type { AppPolicy, Ports } from "@zilobase/runtime-ports";
import { runWithDbEnv } from "../../infrastructure/database";
import type { RuntimeEnv } from "../../shared/config/config";
import type { ZilobaseEditionExtension } from "../../shared/contracts/edition";
import type { AppBindings } from "../../shared/contracts/http";

/** Construct only after verifying authentication at the caller's trust boundary. */
export type ServerOperationContext = {
  authentication: Pick<
    AppBindings["Variables"],
    "authMethod" | "user" | "session" | "apiKey" | "oauthScopes"
  >;
  activeWorkspaceId: string | null;
  pinnedWorkspaceId: string | null;
  env: RuntimeEnv;
  policy: AppPolicy;
  editionExtension: ZilobaseEditionExtension | null;
  runtimePorts: Partial<Ports<any>>;
  requestId: string;
  request?: Request;
};

/** Denials retain HTTP data without depending on an HTTP framework. */
export class ServerOperationError extends Error {
  constructor(
    readonly body: Record<string, unknown>,
    readonly status: number,
    readonly headers: Record<string, string> = {},
  ) {
    super(typeof body.error === "string" ? body.error : "Operation denied");
    this.name = "ServerOperationError";
  }
}

export function requireOperationActor(context: ServerOperationContext) {
  const user = context.authentication.user;
  if (!user) throw new ServerOperationError({ error: "Unauthorized" }, 401);
  return user;
}

export function requireOperationPolicy(
  context: ServerOperationContext,
  input: { write: boolean; oauthScope?: string },
) {
  if (context.authentication.authMethod === "demo" && input.write)
    throw new ServerOperationError(
      { code: "DEMO_READ_ONLY", error: "Changes are disabled in the hosted demo." },
      403,
    );
  if (context.authentication.authMethod !== "oauth") return;
  if (!input.oauthScope)
    throw new ServerOperationError(
      { error: "insufficient_scope", error_description: "This API does not accept OAuth tokens." },
      403,
    );
  if (!context.authentication.oauthScopes?.includes(input.oauthScope))
    throw new ServerOperationError(
      {
        error: "insufficient_scope",
        error_description: `Missing required scope: ${input.oauthScope}`,
      },
      403,
      {
        "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${input.oauthScope}"`,
      },
    );
}

export function requireOperationWorkspace(
  context: ServerOperationContext,
  workspaceId: string | null | undefined,
) {
  if (!context.pinnedWorkspaceId || !workspaceId || workspaceId === context.pinnedWorkspaceId)
    return;
  throw new ServerOperationError(
    {
      error: "Forbidden",
      message:
        context.authentication.authMethod === "oauth"
          ? "OAuth tokens can only access the workspace they were issued for."
          : "API keys can only access the workspace they were created for.",
    },
    403,
  );
}

export function runServerOperation<T>(
  context: ServerOperationContext,
  run: () => Promise<T>,
  options?: { onTiming?: (name: string, durationMs: number) => void },
) {
  return runWithRuntimePorts(context.runtimePorts, () => runWithDbEnv(context.env, run, options));
}
