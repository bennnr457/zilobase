import type { MutationOptions } from "@tanstack/react-query";
import { captureClientOperation, type ClientOperationContext } from "./operation-context";

/** Contextual types shared by the extracted mutation definitions. No observer or provider. */
export function clientMutation<
  TData,
  TError extends Error = Error,
  TVariables = void,
  TOptimistic = unknown,
>(definition: MutationOptions<TData, TError, TVariables, TOptimistic>) {
  return definition;
}

/** Execute domain effects once; React observers retain only observation/caller callbacks. */
export async function runClientMutation<
  TContext extends ClientOperationContext,
  TData,
  TVariables,
  TOptimistic,
>(
  context: TContext,
  input: TVariables,
  create: (context: TContext) => MutationOptions<TData, Error, TVariables, TOptimistic>,
): Promise<TData> {
  const scope = captureClientOperation(context);
  const definition = create(scope.context);
  const mutationContext = {
    client: context.queryClient,
    meta: definition.meta,
    mutationKey: definition.mutationKey,
  };
  let optimistic: TOptimistic | undefined;
  let result: TData | undefined;
  let failure: Error | null = null;
  try {
    optimistic = await definition.onMutate?.(input, mutationContext);
    scope.assertCurrent();
    if (!definition.mutationFn) throw new Error("Client operation has no implementation");
    result = await definition.mutationFn(input, mutationContext);
    scope.assertCurrent();
    await definition.onSuccess?.(result, input, optimistic!, mutationContext);
    return result;
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    if (scope.isCurrent()) await definition.onError?.(failure, input, optimistic, mutationContext);
    throw error;
  } finally {
    if (scope.isCurrent())
      await definition.onSettled?.(result, failure, input, optimistic, mutationContext);
  }
}

const writeSequences = new WeakMap<object, Map<string, symbol>>();
/** Only the latest edit may publish or roll back a query's optimistic projection. */
export function beginClientWrite(context: ClientOperationContext, queryKey: readonly unknown[]) {
  const scope = captureClientOperation(context);
  const keys = writeSequences.get(context.queryClient) ?? new Map<string, symbol>();
  writeSequences.set(context.queryClient, keys);
  const key = JSON.stringify(queryKey),
    token = Symbol();
  keys.set(key, token);
  return { isCurrent: () => scope.isCurrent() && keys.get(key) === token };
}
