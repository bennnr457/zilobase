import type {
  UpdateDatabaseAutomationOperationInput,
  DatabaseAutomationLifecycleOperationInput,
  ValidateDatabaseAutomationOperationInput,
  CreateDatabaseAutomationSecretOperationInput,
} from "./operations";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createDatabaseAutomation,
  createDatabaseAutomationSecret,
  databaseAutomationLifecycle,
  startSlackAutomationOauth,
  updateDatabaseAutomation,
  validateDatabaseAutomation,
} from "./operations";
import { slackAutomationChannelsQueryOptions } from "./queries";

import { useZilobaseFeatures } from "../shared/context";
import type { CreateDatabaseAutomationRequest } from "./contracts";
import {
  databaseAutomationCapabilityQueryOptions,
  databaseAutomationCatalogQueryOptions,
  databaseAutomationDetailQueryOptions,
  databaseAutomationListQueryOptions,
  databaseAutomationRunQueryOptions,
  databaseAutomationRunsQueryOptions,
} from "./queries";

export function useDatabaseAutomationCapability(
  databaseId: string | null | undefined,
  workspaceId: string | null | undefined,
) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(databaseAutomationCapabilityQueryOptions(apiFetch, databaseId, workspaceId));
}

export function useDatabaseAutomations(databaseId: string, dataSourceId: string) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(databaseAutomationListQueryOptions(apiFetch, databaseId, dataSourceId));
}

export function useDatabaseAutomationCatalog(databaseId: string, dataSourceId: string) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(databaseAutomationCatalogQueryOptions(apiFetch, databaseId, dataSourceId));
}

export function useDatabaseAutomation(databaseId: string, automationId: string) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(databaseAutomationDetailQueryOptions(apiFetch, databaseId, automationId));
}

export function useDatabaseAutomationRuns(databaseId: string, automationId: string) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(databaseAutomationRunsQueryOptions(apiFetch, databaseId, automationId));
}

export function useDatabaseAutomationRun(databaseId: string, automationId: string, runId: string) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(databaseAutomationRunQueryOptions(apiFetch, databaseId, automationId, runId));
}

export function useCreateDatabaseAutomation(databaseId: string, dataSourceId: string) {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (
      variables: Omit<CreateDatabaseAutomationRequest, "dataSourceId" | "idempotencyKey">,
    ) => createDatabaseAutomation(context, { databaseId, dataSourceId, ...variables }),
  });
}

export function useUpdateDatabaseAutomation(databaseId: string, automationId: string) {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (
      variables: Omit<UpdateDatabaseAutomationOperationInput, "databaseId" | "automationId">,
    ) => updateDatabaseAutomation(context, { databaseId, automationId, ...variables }),
  });
}

export function useDatabaseAutomationLifecycle(databaseId: string, dataSourceId: string) {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (
      variables: Omit<DatabaseAutomationLifecycleOperationInput, "databaseId" | "dataSourceId">,
    ) => databaseAutomationLifecycle(context, { databaseId, dataSourceId, ...variables }),
  });
}

export function useValidateDatabaseAutomation(databaseId: string) {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: Omit<ValidateDatabaseAutomationOperationInput, "databaseId">) =>
      validateDatabaseAutomation(context, { databaseId, ...variables }),
  });
}

export function useCreateDatabaseAutomationSecret(databaseId: string, dataSourceId: string) {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (
      variables: Omit<CreateDatabaseAutomationSecretOperationInput, "databaseId" | "dataSourceId">,
    ) => createDatabaseAutomationSecret(context, { databaseId, dataSourceId, ...variables }),
  });
}

export function useStartSlackAutomationOauth(databaseId: string, dataSourceId: string) {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: () => startSlackAutomationOauth(context, { databaseId, dataSourceId }),
  });
}

export function useSlackAutomationChannels(
  databaseId: string,
  dataSourceId: string,
  connectionId: string,
) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(
    slackAutomationChannelsQueryOptions(apiFetch, databaseId, dataSourceId, connectionId),
  );
}
