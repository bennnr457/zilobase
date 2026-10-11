import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useZilobaseFeatures, type ApiFetcher } from "../shared/context";
import { useActiveWorkspaceId } from "../workspaces/hooks";
import { workspaceRequestOptions } from "../workspaces/queries";
import type {
  McpActivityEntry,
  McpApprovedServer,
  McpConnectionSummary,
  McpConnectionScopeRef,
  McpServerCatalogEntry,
  McpWorkspacePolicy,
} from "./mcp-contract";

const mcpCatalogQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "mcp-catalog"] as const;

const approvedMcpServersQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "mcp-approved-servers"] as const;

const mcpWorkspacePolicyQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "mcp-policy"] as const;

function mcpCatalogQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  enabled: boolean,
) {
  return queryOptions({
    enabled: Boolean(workspaceId) && enabled,
    queryFn: ({ signal }) =>
      apiFetch<{ catalog: McpServerCatalogEntry[] }>(
        "/api/ai/mcp/catalog",
        workspaceRequestOptions(workspaceId, { signal }),
      ).then((result) => result.catalog),
    queryKey: mcpCatalogQueryKey(workspaceId),
    retry: false,
  });
}

function approvedMcpServersQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  enabled: boolean,
) {
  return queryOptions({
    enabled: Boolean(workspaceId) && enabled,
    queryFn: ({ signal }) =>
      apiFetch<{
        approvedServers: McpApprovedServer[];
      }>("/api/ai/mcp/approved-servers", workspaceRequestOptions(workspaceId, { signal })).then(
        (result) => result.approvedServers,
      ),
    queryKey: approvedMcpServersQueryKey(workspaceId),
    retry: false,
  });
}

function mcpWorkspacePolicyQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  enabled: boolean,
) {
  return queryOptions({
    enabled: Boolean(workspaceId) && enabled,
    queryFn: ({ signal }) =>
      apiFetch<{
        approvedServers: McpApprovedServer[];
        policy: McpWorkspacePolicy;
      }>("/api/ai/mcp/policy", workspaceRequestOptions(workspaceId, { signal })),
    queryKey: mcpWorkspacePolicyQueryKey(workspaceId),
    retry: false,
  });
}

export function useMcpCatalog(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  return useQuery(mcpCatalogQueryOptions(apiFetch, workspaceId, options?.enabled ?? true));
}

export function useApprovedMcpServers(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  return useQuery(approvedMcpServersQueryOptions(apiFetch, workspaceId, options?.enabled ?? true));
}

export function useMcpWorkspacePolicy(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  return useQuery(mcpWorkspacePolicyQueryOptions(apiFetch, workspaceId, options?.enabled ?? true));
}

export function useMcpPolicyMutation<TInput extends object, TOutput>(
  path: (input: TInput) => string,
  method: "POST" | "PUT" | "DELETE",
) {
  const { apiFetch } = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      apiFetch<TOutput>(path(input), {
        body: method === "DELETE" ? undefined : JSON.stringify(input),
        headers: {
          ...(method === "DELETE" ? {} : { "Content-Type": "application/json" }),
          ...(workspaceId ? { "x-zilobase-workspace-id": workspaceId } : {}),
        },
        method,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: mcpWorkspacePolicyQueryKey(workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: approvedMcpServersQueryKey(workspaceId),
        }),
      ]),
  });
}

export function mcpScopeApiPath(_scope: McpConnectionScopeRef) {
  return "/api/ai/mcp";
}

function mcpScopeQueryKey(_scope: McpConnectionScopeRef | null) {
  return ["personal"] as const;
}

const mcpConnectionsQueryKey = (
  workspaceId: string | null | undefined,
  scope: McpConnectionScopeRef | null,
) =>
  ["workspaces", workspaceId ?? "none", "mcp", ...mcpScopeQueryKey(scope), "connections"] as const;

const mcpActivityQueryKey = (
  workspaceId: string | null | undefined,
  scope: McpConnectionScopeRef | null,
) => ["workspaces", workspaceId ?? "none", "mcp", ...mcpScopeQueryKey(scope), "activity"] as const;

function mcpConnectionsQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  scope: McpConnectionScopeRef | null,
) {
  return queryOptions({
    enabled: Boolean(workspaceId && scope),
    queryFn: ({ signal }) =>
      apiFetch<{
        connections: McpConnectionSummary[];
      }>(
        `${mcpScopeApiPath(scope!)}/connections`,
        workspaceRequestOptions(workspaceId, { signal }),
      ).then((result) => result.connections),
    queryKey: mcpConnectionsQueryKey(workspaceId, scope),
  });
}

function mcpActivityQueryOptions(
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  scope: McpConnectionScopeRef | null,
  enabled: boolean,
) {
  return queryOptions({
    enabled: Boolean(workspaceId && scope && enabled),
    queryFn: ({ signal }) =>
      apiFetch<{ activity: McpActivityEntry[] }>(
        `${mcpScopeApiPath(scope!)}/activity`,
        workspaceRequestOptions(workspaceId, { signal }),
      ).then((result) => result.activity),
    queryKey: mcpActivityQueryKey(workspaceId, scope),
  });
}

export function useMcpConnections(scope: McpConnectionScopeRef | null) {
  const { apiFetch } = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  return useQuery(mcpConnectionsQueryOptions(apiFetch, workspaceId, scope));
}

export function useMcpActivity(scope: McpConnectionScopeRef | null, enabled: boolean) {
  const { apiFetch } = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  return useQuery(mcpActivityQueryOptions(apiFetch, workspaceId, scope, enabled));
}

export function useMcpConnectionMutation<TInput extends object, TOutput>(
  scope: McpConnectionScopeRef | null,
  path: (input: TInput) => string,
  method: "POST" | "PUT" | "DELETE",
) {
  const { apiFetch } = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      apiFetch<TOutput>(path(input), {
        body: method === "DELETE" ? undefined : JSON.stringify(input),
        headers: {
          ...(method === "DELETE" ? {} : { "Content-Type": "application/json" }),
          ...(workspaceId ? { "x-zilobase-workspace-id": workspaceId } : {}),
        },
        method,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: mcpConnectionsQueryKey(workspaceId, scope),
      }),
  });
}
