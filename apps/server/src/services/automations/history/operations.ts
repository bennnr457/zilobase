import {
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { requireAutomationDatabaseWorkspace, requireAutomationSource } from "../operation-support";
import { exportDatabaseAutomationAudit } from "./audit-export";
import { getDatabaseAutomationRun, listDatabaseAutomationRuns } from "./run-history";

export type ExportAutomationAuditOperationInput = { databaseId: string; dataSourceId?: string };
export async function exportAutomationAuditOperation(
  context: ServerOperationContext,
  operationInput: ExportAutomationAuditOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const source = requireAutomationSource(context, operationInput.dataSourceId);

  const { user, dataSourceId } = source;
  return (() =>
    exportDatabaseAutomationAudit({
      databaseId: operationInput.databaseId,
      dataSourceId,
      userId: user.id,
    }))();
}

export type ListAutomationRunsOperationInput = {
  databaseId: string;
  limit?: string;
  automationId: string;
};
export async function listAutomationRunsOperation(
  context: ServerOperationContext,
  operationInput: ListAutomationRunsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const requestedLimit = Number(operationInput.limit ?? 50);
  return (() =>
    listDatabaseAutomationRuns({
      automationId: operationInput.automationId,
      databaseId: operationInput.databaseId,
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 50,
      userId: user.id,
    }))();
}

export type ReadAutomationRunOperationInput = {
  databaseId: string;
  automationId: string;
  runId: string;
};
export async function readAutomationRunOperation(
  context: ServerOperationContext,
  operationInput: ReadAutomationRunOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  await requireAutomationDatabaseWorkspace(context, operationInput.databaseId);

  const user = context.authentication.user;
  if (!user) return deny({ error: "Unauthorized" }, 401);
  return (() =>
    getDatabaseAutomationRun({
      automationId: operationInput.automationId,
      databaseId: operationInput.databaseId,
      runId: operationInput.runId,
      userId: user.id,
    }))();
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
