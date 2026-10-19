import { queryOptions } from "@tanstack/react-query";
import type { ApiFetcher } from "../shared/api-fetcher";
import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import { clientMutation, runClientMutation } from "../shared/operation-mutation";

import {
  type PageLayoutConfig,
  type PageLayoutScope,
  type PageLayoutTarget,
  type ResolvedPageLayout,
} from "./page-layouts";

export const pageLayoutKeys = {
  all: ["page-layouts"] as const,
  resolved: (target: PageLayoutTarget) =>
    ["page-layouts", "resolved", target.pageId ?? "none", target.databaseId ?? "none"] as const,
  scope: (scope: PageLayoutScope, scopeId: string) =>
    ["page-layouts", "scope", scope, scopeId] as const,
};

export type SavePageLayoutInput = {
  clearPageOverrides?: boolean;
  config: PageLayoutConfig;
  scope: PageLayoutScope;
  scopeId: string;
};

export function resolvedPageLayoutQueryOptions(apiFetch: ApiFetcher, target: PageLayoutTarget) {
  return queryOptions({
    enabled: Boolean(target.pageId || target.databaseId),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (target.pageId) params.set("pageId", target.pageId);
      if (target.databaseId) params.set("databaseId", target.databaseId);
      return apiFetch<ResolvedPageLayout>(`/page-layouts/resolve?${params}`, {
        signal,
      });
    },
    queryKey: pageLayoutKeys.resolved(target),
    staleTime: 30_000,
  });
}

function defineSavePageLayoutMutation(context: ClientOperationContext) {
  const scope = captureClientOperation(context);
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: SavePageLayoutInput) =>
      apiFetch(`/page-layouts/${input.scope}/${encodeURIComponent(input.scopeId)}`, {
        method: "PUT",
        body: JSON.stringify({
          config: input.config,
          clearPageOverrides: input.clearPageOverrides,
        }),
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: pageLayoutKeys.all });
      scope.assertCurrent();
      const previous = queryClient.getQueriesData({ queryKey: pageLayoutKeys.all });
      queryClient.setQueryData(pageLayoutKeys.scope(input.scope, input.scopeId), input.config);
      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [key, value] of context?.previous ?? []) {
        queryClient.setQueryData(key, value);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: pageLayoutKeys.all }),
  });
}
export type SavePageLayoutResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSavePageLayoutMutation>["mutationFn"]>>
>;
export function savePageLayout(
  context: ClientOperationContext,
  input: SavePageLayoutInput,
): Promise<SavePageLayoutResult> {
  return runClientMutation(context, input, defineSavePageLayoutMutation);
}

function defineResetPageLayoutMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: { scope: PageLayoutScope; scopeId: string }) =>
      apiFetch(`/page-layouts/${input.scope}/${encodeURIComponent(input.scopeId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pageLayoutKeys.all }),
  });
}
export type ResetPageLayoutInput = Parameters<
  NonNullable<ReturnType<typeof defineResetPageLayoutMutation>["mutationFn"]>
>[0];
export type ResetPageLayoutResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineResetPageLayoutMutation>["mutationFn"]>>
>;
export function resetPageLayout(
  context: ClientOperationContext,
  input: ResetPageLayoutInput,
): Promise<ResetPageLayoutResult> {
  return runClientMutation(context, input, defineResetPageLayoutMutation);
}
