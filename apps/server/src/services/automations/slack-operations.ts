import { requireDataSourceAccess } from "../databases/access/data-source-access";
import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { findOwnedSlackConnection, revokeSlackConnection } from "./actions/slack/connections";
import {
  beginSlackOauth,
  listSlackChannels,
  SlackProviderError,
} from "./actions/slack/slack-provider";
import { isAutomationSlackEnabled } from "./configuration";
import { getDatabaseAutomationCatalog } from "./definition/definition-catalog";
import { requireAutomationDatabaseWorkspace } from "./operation-support";

async function connectionWorkspace(databaseId: string, dataSourceId: string, userId: string) {
  const source = await requireDataSourceAccess(dataSourceId, userId, "full");
  if (source.parentDatabaseId !== databaseId)
    throw new SlackProviderError("Database source not found", "SOURCE_NOT_FOUND", 404);
  return source.workspaceId;
}

function slackError(error: unknown): never {
  if (error instanceof SlackProviderError)
    return deny(
      { error: error.message, code: error.code },
      error.status as 400 | 401 | 404 | 409 | 429 | 500 | 502 | 503 | 504,
    );
  return deny({ error: error instanceof Error ? error.message : "Slack request failed" }, 500);
}

export type StartAutomationSlackConnectionOperationInput = { databaseId: string; body?: unknown };
export async function startAutomationSlackConnectionOperation(
  context: ServerOperationContext,
  operationInput: StartAutomationSlackConnectionOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const body = (await readBody().catch(() => null)) as {
    dataSourceId?: unknown;
  } | null;
  if (!body || typeof body.dataSourceId !== "string")
    return deny({ error: "dataSourceId is required" }, 400);
  try {
    const catalog = await getDatabaseAutomationCatalog({
      databaseId: operationInput.databaseId,
      dataSourceId: body.dataSourceId,
      slackEnabled: isAutomationSlackEnabled(context.env ?? {}),
      userId: user.id,
    });
    if (!catalog.canManage)
      return deny({ error: catalog.manageUnavailableReason ?? "Forbidden" }, 403);
    const workspaceId = await connectionWorkspace(
      operationInput.databaseId,
      body.dataSourceId,
      user.id,
    );
    return {
      authorizationUrl: await beginSlackOauth(context.env ?? {}, { userId: user.id, workspaceId }),
    };
  } catch (error) {
    return slackError(error);
  }
}

export type ListAutomationSlackChannelsOperationInput = {
  databaseId: string;
  dataSourceId?: string;
  connectionId: string;
};
export async function listAutomationSlackChannelsOperation(
  context: ServerOperationContext,
  operationInput: ListAutomationSlackChannelsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const dataSourceId = operationInput.dataSourceId;
  if (!dataSourceId) return deny({ error: "dataSourceId is required" }, 400);
  try {
    const catalog = await getDatabaseAutomationCatalog({
      databaseId: operationInput.databaseId,
      dataSourceId,
      slackEnabled: isAutomationSlackEnabled(context.env ?? {}),
      userId: user.id,
    });
    const allowed = catalog.slackConnections.find(({ id }) => id === operationInput.connectionId);
    if (!allowed) return deny({ error: "Slack connection not found" }, 404);
    const connection = await findOwnedSlackConnection(allowed.id, user.id);
    if (!connection) return deny({ error: "Slack connection not found" }, 404);
    return { channels: await listSlackChannels(context.env ?? {}, connection) };
  } catch (error) {
    if (error instanceof SlackProviderError && error.code === "SLACK_CONNECTION_REVOKED") {
      await revokeSlackConnection(
        operationInput.connectionId,
        user.id,
        error.code,
        "The automation owner's Slack connection was revoked",
      );
    }
    return slackError(error);
  }
}

export type DisconnectAutomationSlackOperationInput = {
  databaseId: string;
  dataSourceId?: string;
  connectionId: string;
};
export async function disconnectAutomationSlackOperation(
  context: ServerOperationContext,
  operationInput: DisconnectAutomationSlackOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const dataSourceId = operationInput.dataSourceId;
  if (!dataSourceId) return deny({ error: "dataSourceId is required" }, 400);
  const catalog = await getDatabaseAutomationCatalog({
    databaseId: operationInput.databaseId,
    dataSourceId,
    slackEnabled: isAutomationSlackEnabled(context.env ?? {}),
    userId: user.id,
  });
  if (!catalog.slackConnections.some(({ id }) => id === operationInput.connectionId))
    return deny({ error: "Slack connection not found" }, 404);
  await revokeSlackConnection(
    operationInput.connectionId,
    user.id,
    "disconnected",
    "The automation owner's Slack connection was disconnected",
  );
  return { disconnected: true };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
