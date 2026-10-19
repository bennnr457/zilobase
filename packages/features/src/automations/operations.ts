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

function defineCreateDatabaseAutomationMutation(
  context: ClientOperationContext,
  databaseId: string,
  dataSourceId: string,
) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (
      body: Omit<CreateDatabaseAutomationRequest, "dataSourceId" | "idempotencyKey">,
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
}
export type CreateDatabaseAutomationOperationInput = {
  databaseId: string;
  dataSourceId: string;
} & Parameters<
  NonNullable<ReturnType<typeof defineCreateDatabaseAutomationMutation>["mutationFn"]>
>[0];
export type CreateDatabaseAutomationOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineCreateDatabaseAutomationMutation>["mutationFn"]>>
>;
export function createDatabaseAutomation(
  context: ClientOperationContext,
  input: CreateDatabaseAutomationOperationInput,
): Promise<CreateDatabaseAutomationOperationResult> {
  const { databaseId, dataSourceId, ...variables } = input;
  return runClientMutation(context, variables, (context) =>
    defineCreateDatabaseAutomationMutation(context, databaseId, dataSourceId),
  );
}

function defineUpdateDatabaseAutomationMutation(
  context: ClientOperationContext,
  databaseId: string,
  automationId: string,
) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: ({ body, version }: { body: UpdateDatabaseAutomationRequest; version: number }) =>
      apiFetch<DatabaseAutomationDetail>(
        `/databases/${encoded(databaseId)}/automations/${encoded(automationId)}`,
        { body: JSON.stringify(body), headers: { "If-Match": String(version) }, method: "PATCH" },
      ),
    onSuccess: (automation) => {
      queryClient.setQueryData(databaseAutomationKeys.detail(databaseId, automationId), automation);
      return queryClient.invalidateQueries({ queryKey: databaseAutomationKeys.all });
    },
  });
}
export type UpdateDatabaseAutomationOperationInput = {
  databaseId: string;
  automationId: string;
} & Parameters<
  NonNullable<ReturnType<typeof defineUpdateDatabaseAutomationMutation>["mutationFn"]>
>[0];
export type UpdateDatabaseAutomationOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateDatabaseAutomationMutation>["mutationFn"]>>
>;
export function updateDatabaseAutomation(
  context: ClientOperationContext,
  input: UpdateDatabaseAutomationOperationInput,
): Promise<UpdateDatabaseAutomationOperationResult> {
  const { databaseId, automationId, ...variables } = input;
  return runClientMutation(context, variables, (context) =>
    defineUpdateDatabaseAutomationMutation(context, databaseId, automationId),
  );
}

function defineDatabaseAutomationLifecycleMutation(
  context: ClientOperationContext,
  databaseId: string,
  dataSourceId: string,
) {
  const { apiFetch, queryClient } = context;
  return clientMutation<
    DatabaseAutomationDetail | DatabaseAutomationSummary | { deleted: boolean },
    Error,
    {
      action: "delete" | "duplicate" | "pause" | "resume";
      automationId: string;
    }
  >({
    mutationFn: ({
      action,
      automationId,
    }: {
      action: "delete" | "duplicate" | "pause" | "resume";
      automationId: string;
    }) => {
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
}
export type DatabaseAutomationLifecycleOperationInput = {
  databaseId: string;
  dataSourceId: string;
} & Parameters<
  NonNullable<ReturnType<typeof defineDatabaseAutomationLifecycleMutation>["mutationFn"]>
>[0];
export type DatabaseAutomationLifecycleOperationResult = Awaited<
  ReturnType<
    NonNullable<ReturnType<typeof defineDatabaseAutomationLifecycleMutation>["mutationFn"]>
  >
>;
export function databaseAutomationLifecycle(
  context: ClientOperationContext,
  input: DatabaseAutomationLifecycleOperationInput,
): Promise<DatabaseAutomationLifecycleOperationResult> {
  const { databaseId, dataSourceId, ...variables } = input;
  return runClientMutation(context, variables, (context) =>
    defineDatabaseAutomationLifecycleMutation(context, databaseId, dataSourceId),
  );
}

function defineValidateDatabaseAutomationMutation(
  context: ClientOperationContext,
  databaseId: string,
) {
  const { apiFetch } = context;
  return clientMutation({
    mutationFn: ({
      dataSourceId,
      definition,
    }: {
      dataSourceId: string;
      definition: DatabaseAutomationDefinition;
    }) =>
      apiFetch<DatabaseAutomationValidationResult>(
        `/databases/${encoded(databaseId)}/automations/validate`,
        {
          body: JSON.stringify({ dataSourceId, definition }),
          method: "POST",
        },
      ),
  });
}
export type ValidateDatabaseAutomationOperationInput = { databaseId: string } & Parameters<
  NonNullable<ReturnType<typeof defineValidateDatabaseAutomationMutation>["mutationFn"]>
>[0];
export type ValidateDatabaseAutomationOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineValidateDatabaseAutomationMutation>["mutationFn"]>>
>;
export function validateDatabaseAutomation(
  context: ClientOperationContext,
  input: ValidateDatabaseAutomationOperationInput,
): Promise<ValidateDatabaseAutomationOperationResult> {
  const { databaseId, ...variables } = input;
  return runClientMutation(context, variables, (context) =>
    defineValidateDatabaseAutomationMutation(context, databaseId),
  );
}

function defineCreateDatabaseAutomationSecretMutation(
  context: ClientOperationContext,
  databaseId: string,
  dataSourceId: string,
) {
  const { apiFetch } = context;
  return clientMutation({
    mutationFn: (body: { purpose: "webhook_header"; value: string }) =>
      apiFetch<{ id: string; purpose: "webhook_header" }>(
        `/databases/${encoded(databaseId)}/automation-secrets`,
        { body: JSON.stringify({ ...body, dataSourceId }), method: "POST" },
      ),
  });
}
export type CreateDatabaseAutomationSecretOperationInput = {
  databaseId: string;
  dataSourceId: string;
} & Parameters<
  NonNullable<ReturnType<typeof defineCreateDatabaseAutomationSecretMutation>["mutationFn"]>
>[0];
export type CreateDatabaseAutomationSecretOperationResult = Awaited<
  ReturnType<
    NonNullable<ReturnType<typeof defineCreateDatabaseAutomationSecretMutation>["mutationFn"]>
  >
>;
export function createDatabaseAutomationSecret(
  context: ClientOperationContext,
  input: CreateDatabaseAutomationSecretOperationInput,
): Promise<CreateDatabaseAutomationSecretOperationResult> {
  const { databaseId, dataSourceId, ...variables } = input;
  return runClientMutation(context, variables, (context) =>
    defineCreateDatabaseAutomationSecretMutation(context, databaseId, dataSourceId),
  );
}

function defineStartSlackAutomationOauthMutation(
  context: ClientOperationContext,
  databaseId: string,
  dataSourceId: string,
) {
  const { apiFetch } = context;
  return clientMutation({
    mutationFn: () =>
      apiFetch<{ authorizationUrl: string }>(
        `/databases/${encoded(databaseId)}/automation-slack/oauth/start`,
        { body: JSON.stringify({ dataSourceId }), method: "POST" },
      ),
  });
}
export type StartSlackAutomationOauthOperationInput = { databaseId: string; dataSourceId: string };
export type StartSlackAutomationOauthOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineStartSlackAutomationOauthMutation>["mutationFn"]>>
>;
export function startSlackAutomationOauth(
  context: ClientOperationContext,
  input: StartSlackAutomationOauthOperationInput,
): Promise<StartSlackAutomationOauthOperationResult> {
  const { databaseId, dataSourceId } = input;
  return runClientMutation(context, undefined, (context) =>
    defineStartSlackAutomationOauthMutation(context, databaseId, dataSourceId),
  );
}
