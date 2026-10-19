import { type ClientOperationContext } from "../shared/operation-context";
import { clientMutation, runClientMutation } from "../shared/operation-mutation";

import type {
  CreateDatabaseAutomationRequest,
  DatabaseAutomationDefinition,
  DatabaseAutomationDetail,
  DatabaseAutomationSummary,
  DatabaseAutomationValidationResult,
  UpdateDatabaseAutomationRequest,
} from "./contracts";
import { databaseAutomationKeys } from "./queries";

const encoded = (value: string) => encodeURIComponent(value);

export type CreateDatabaseAutomationOperationInput = {
  databaseId: string;
  dataSourceId: string;
} & Omit<CreateDatabaseAutomationRequest, "dataSourceId" | "idempotencyKey">;
export type CreateDatabaseAutomationOperationResult = DatabaseAutomationDetail;
export function createDatabaseAutomation(
  context: ClientOperationContext,
  input: CreateDatabaseAutomationOperationInput,
): Promise<CreateDatabaseAutomationOperationResult> {
  const { databaseId, dataSourceId, ...variables } = input;
  return runClientMutation(context, variables, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (
        body: Omit<CreateDatabaseAutomationOperationInput, "databaseId" | "dataSourceId">,
      ) => {
        const idempotencyKey = crypto.randomUUID();
        return apiFetch<DatabaseAutomationDetail>(`/databases/${encoded(databaseId)}/automations`, {
          body: JSON.stringify({ ...body, dataSourceId, idempotencyKey }),
          headers: { "Idempotency-Key": idempotencyKey },
          method: "POST",
        });
      },
      onSuccess: (automation) => {
        queryClient.setQueryData(
          databaseAutomationKeys.detail(databaseId, automation.id),
          automation,
        );
        return queryClient.invalidateQueries({
          queryKey: databaseAutomationKeys.list(databaseId, dataSourceId),
        });
      },
    });
  });
}

export type UpdateDatabaseAutomationOperationInput = {
  databaseId: string;
  automationId: string;
  body: UpdateDatabaseAutomationRequest;
  version: number;
};
export type UpdateDatabaseAutomationOperationResult = DatabaseAutomationDetail;
export function updateDatabaseAutomation(
  context: ClientOperationContext,
  input: UpdateDatabaseAutomationOperationInput,
): Promise<UpdateDatabaseAutomationOperationResult> {
  const { databaseId, automationId, ...variables } = input;
  return runClientMutation(context, variables, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: ({
        body,
        version,
      }: Omit<UpdateDatabaseAutomationOperationInput, "databaseId" | "automationId">) =>
        apiFetch<DatabaseAutomationDetail>(
          `/databases/${encoded(databaseId)}/automations/${encoded(automationId)}`,
          { body: JSON.stringify(body), headers: { "If-Match": String(version) }, method: "PATCH" },
        ),
      onSuccess: (automation) => {
        queryClient.setQueryData(
          databaseAutomationKeys.detail(databaseId, automationId),
          automation,
        );
        return queryClient.invalidateQueries({ queryKey: databaseAutomationKeys.all });
      },
    });
  });
}

export type DatabaseAutomationLifecycleOperationInput = {
  databaseId: string;
  dataSourceId: string;
  action: "delete" | "duplicate" | "pause" | "resume";
  automationId: string;
};
export type DatabaseAutomationLifecycleOperationResult =
  | DatabaseAutomationDetail
  | DatabaseAutomationSummary
  | { deleted: boolean };
export function databaseAutomationLifecycle(
  context: ClientOperationContext,
  input: DatabaseAutomationLifecycleOperationInput,
): Promise<DatabaseAutomationLifecycleOperationResult> {
  const { databaseId, dataSourceId, ...variables } = input;
  return runClientMutation(context, variables, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation<
      DatabaseAutomationLifecycleOperationResult,
      Error,
      Omit<DatabaseAutomationLifecycleOperationInput, "databaseId" | "dataSourceId">
    >({
      mutationFn: ({
        action,
        automationId,
      }: Omit<DatabaseAutomationLifecycleOperationInput, "databaseId" | "dataSourceId">) => {
        const path = `/databases/${encoded(databaseId)}/automations/${encoded(automationId)}`;
        if (action === "delete") return apiFetch<{ deleted: boolean }>(path, { method: "DELETE" });
        const idempotencyKey = crypto.randomUUID();
        return apiFetch<DatabaseAutomationDetail | DatabaseAutomationSummary>(`${path}/${action}`, {
          headers: action === "duplicate" ? { "Idempotency-Key": idempotencyKey } : undefined,
          method: "POST",
        });
      },
      onSettled: () =>
        queryClient.invalidateQueries({
          queryKey: databaseAutomationKeys.list(databaseId, dataSourceId),
        }),
    });
  });
}

export type ValidateDatabaseAutomationOperationInput = {
  databaseId: string;
  dataSourceId: string;
  definition: DatabaseAutomationDefinition;
};
export type ValidateDatabaseAutomationOperationResult = DatabaseAutomationValidationResult;
export function validateDatabaseAutomation(
  context: ClientOperationContext,
  input: ValidateDatabaseAutomationOperationInput,
): Promise<ValidateDatabaseAutomationOperationResult> {
  const { databaseId, ...variables } = input;
  return runClientMutation(context, variables, (context) => {
    const { apiFetch } = context;
    return clientMutation({
      mutationFn: ({
        dataSourceId,
        definition,
      }: Omit<ValidateDatabaseAutomationOperationInput, "databaseId">) =>
        apiFetch<DatabaseAutomationValidationResult>(
          `/databases/${encoded(databaseId)}/automations/validate`,
          {
            body: JSON.stringify({ dataSourceId, definition }),
            method: "POST",
          },
        ),
    });
  });
}

export type CreateDatabaseAutomationSecretOperationInput = {
  databaseId: string;
  dataSourceId: string;
  purpose: "webhook_header";
  value: string;
};
export type CreateDatabaseAutomationSecretOperationResult = {
  id: string;
  purpose: "webhook_header";
};
export function createDatabaseAutomationSecret(
  context: ClientOperationContext,
  input: CreateDatabaseAutomationSecretOperationInput,
): Promise<CreateDatabaseAutomationSecretOperationResult> {
  const { databaseId, dataSourceId, ...variables } = input;
  return runClientMutation(context, variables, (context) => {
    const { apiFetch } = context;
    return clientMutation({
      mutationFn: (
        body: Omit<CreateDatabaseAutomationSecretOperationInput, "databaseId" | "dataSourceId">,
      ) =>
        apiFetch<{ id: string; purpose: "webhook_header" }>(
          `/databases/${encoded(databaseId)}/automation-secrets`,
          { body: JSON.stringify({ ...body, dataSourceId }), method: "POST" },
        ),
    });
  });
}

export type StartSlackAutomationOauthOperationInput = { databaseId: string; dataSourceId: string };
export type StartSlackAutomationOauthOperationResult = { authorizationUrl: string };
export function startSlackAutomationOauth(
  context: ClientOperationContext,
  input: StartSlackAutomationOauthOperationInput,
): Promise<StartSlackAutomationOauthOperationResult> {
  const { databaseId, dataSourceId } = input;
  return runClientMutation(context, undefined, (context) => {
    const { apiFetch } = context;
    return clientMutation({
      mutationFn: () =>
        apiFetch<{ authorizationUrl: string }>(
          `/databases/${encoded(databaseId)}/automation-slack/oauth/start`,
          { body: JSON.stringify({ dataSourceId }), method: "POST" },
        ),
    });
  });
}
