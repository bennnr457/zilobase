import { resolveDatabaseAccessReferences } from "../pages/access-references";
import {
  captureClientOperation,
  clientDatabaseController,
  type ClientOperationContext,
} from "../shared/operation-context";
import { resolveDatabaseBootstrap, resolveRecordWindow } from "./cache-references";
import { databaseMutationFeedResponseSchema, type DatabaseInitialPageSize } from "./core/entities";
import { resolveDatabaseExportReference } from "./export-references";
import { databaseBootstrapQueryOptions, type DatabaseScope } from "./queries/bootstrap";
import { databaseAccessQueryOptions, databaseContextExportQueryOptions } from "./queries/queries";
import { databaseWindowQueryOptions, type DatabaseWindowFetchScope } from "./queries/records";

export async function getDatabaseBootstrap(context: ClientOperationContext, input: DatabaseScope) {
  const scope = captureClientOperation(context);
  const result = await context.queryClient.fetchQuery(
    databaseBootstrapQueryOptions(
      scope.context.apiFetch,
      clientDatabaseController(context).sessionId,
      input,
      context.queryClient,
    ),
  );
  scope.assertCurrent();
  return resolveDatabaseBootstrap(context.queryClient, result);
}

export async function getDatabaseRecordWindow(
  context: ClientOperationContext,
  input: DatabaseWindowFetchScope & { pageSize?: DatabaseInitialPageSize },
) {
  const scope = captureClientOperation(context);
  const result = await context.queryClient.fetchInfiniteQuery(
    databaseWindowQueryOptions(
      scope.context.apiFetch,
      clientDatabaseController(context).sessionId,
      input,
      input.pageSize ?? 50,
      context.queryClient,
    ),
  );
  scope.assertCurrent();
  return resolveRecordWindow(context.queryClient, result.pages.at(-1));
}

export async function getDatabaseExport(
  context: ClientOperationContext,
  input: { databaseId: string; dataSourceId?: string },
) {
  const scope = captureClientOperation(context);
  const result = await context.queryClient.fetchQuery(
    databaseContextExportQueryOptions(scope.context.apiFetch, input.databaseId, input.dataSourceId),
  );
  scope.assertCurrent();
  return resolveDatabaseExportReference(context.queryClient, result);
}

export async function getDatabaseAccess(
  context: ClientOperationContext,
  input: { databaseId: string },
) {
  const scope = captureClientOperation(context);
  const result = await context.queryClient.fetchQuery(
    databaseAccessQueryOptions(scope.context.apiFetch, input.databaseId),
  );
  scope.assertCurrent();
  return resolveDatabaseAccessReferences(context.queryClient, result);
}

export async function getDatabaseMutationHistory(
  context: ClientOperationContext,
  input: { databaseId: string; afterVersion: number; limit?: number },
) {
  const scope = captureClientOperation(context);
  const query = new URLSearchParams({ afterVersion: String(input.afterVersion) });
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  return databaseMutationFeedResponseSchema.parse(
    await scope.context.apiFetch(
      `/databases/${encodeURIComponent(input.databaseId)}/mutations?${query}`,
    ),
  );
}
