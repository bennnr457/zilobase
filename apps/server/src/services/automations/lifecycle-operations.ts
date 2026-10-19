import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { isAutomationSlackEnabled, isAutomationWebhooksEnabled } from "./configuration";
import { setDatabaseAutomationPaused } from "./definition/definition-lifecycle";
import { requireAutomationDatabaseWorkspace, webhookHttpDomains } from "./operation-support";

export type SetAutomationPausedOperationInput = {
  databaseId: string;
  paused: boolean;
  automationId: string;
};
export async function setAutomationPausedOperation(
  context: ServerOperationContext,
  operationInput: SetAutomationPausedOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  return (() =>
    setDatabaseAutomationPaused({
      allowHttpWebhookDomains: webhookHttpDomains(context),
      automationId: operationInput.automationId,
      databaseId: operationInput.databaseId,
      editionExtension: context.editionExtension ?? undefined,
      slackEnabled: isAutomationSlackEnabled(context.env ?? {}),
      webhooksEnabled: isAutomationWebhooksEnabled(context.env ?? {}),
      paused: operationInput.paused,
      userId: user.id,
    }))();
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
