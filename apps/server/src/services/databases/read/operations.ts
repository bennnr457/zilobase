import {
  canAccessDatabaseRecord,
  getEffectiveDatabaseAccessForRecord,
  isDatabasePublishedInWorkspace,
} from "../../access/effective-access";
import { getMembership, getWorkspacePrincipalKind } from "../../access/principal-access";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { getDatabaseRecord } from "../access/database-access";
import { DATABASE_MUTATION_FEED_LIMIT, getDatabaseMutationFeed } from "../history/service";
import { listDatabaseAccessRulesService } from "../sharing/service";
import {
  getDatabaseBootstrapService,
  getDatabaseExportService,
  getDatabaseRecordWindowService,
  MAX_DATABASE_RECORD_WINDOW_LIMIT,
} from "./service";

export async function requireDatabaseOperationWorkspace(
  context: ServerOperationContext,
  databaseId: string,
) {
  if (!context.pinnedWorkspaceId) return;
  const record = await getDatabaseRecord(databaseId, { includeDeleted: true });
  if (!record) throw new ServerOperationError({ error: "Resource not found" }, 404);
  requireOperationWorkspace(context, record.workspaceId);
}
export async function readableDatabase(
  context: ServerOperationContext,
  databaseId: string,
  includeDeleted: boolean,
) {
  requireOperationPolicy(context, { write: false, oauthScope: "databases.read" });
  await requireDatabaseOperationWorkspace(context, databaseId);
  const user = context.authentication.user ?? null;
  const record = await getDatabaseRecord(databaseId, { includeDeleted });

  if (!record) {
    throw new ServerOperationError({ error: "Database not found" }, 404);
  }

  const canView = record.deletedAt
    ? user
      ? Boolean(await getMembership(record.workspaceId, user.id))
      : false
    : user
      ? await canAccessDatabaseRecord(record, user.id, "view")
      : false;

  if (!canView) {
    const published = await isDatabasePublishedInWorkspace(record.id, record.workspaceId);
    if (!published) {
      throw new ServerOperationError(
        { error: user ? "Forbidden" : "Unauthorized" },
        user ? 403 : 401,
      );
    }
  }

  const accessLevel = user
    ? record.deletedAt
      ? null
      : await getEffectiveDatabaseAccessForRecord(record, user.id)
    : null;

  return {
    accessLevel:
      accessLevel === "none" || accessLevel === "comment"
        ? accessLevel === "comment"
          ? ("view" as const)
          : null
        : accessLevel,
    record,
    viewerType:
      canView && user
        ? ((await getWorkspacePrincipalKind(record.workspaceId, user.id)) ?? "guest")
        : "public",
    user: canView ? user : null,
  };
}

export type DatabaseBootstrapInput = {
  databaseId: string;
  includeDeleted?: boolean;
  viewId?: string;
};
export async function readDatabaseBootstrap(
  context: ServerOperationContext,
  input: DatabaseBootstrapInput,
) {
  const readable = await readableDatabase(context, input.databaseId, input.includeDeleted ?? false);
  const bootstrap = await getDatabaseBootstrapService({
    accessLevel: readable.accessLevel,
    databaseId: readable.record.id,
    existingRecord: readable.record,
    includeDeleted: input.includeDeleted ?? false,
    userId: readable.user?.id,
    viewId: input.viewId,
  });
  return { ...bootstrap, viewerType: readable.viewerType };
}
export async function readDatabaseExport(
  context: ServerOperationContext,
  input: { databaseId: string; dataSourceId?: string },
) {
  const readable = await readableDatabase(context, input.databaseId, false);
  if (input.dataSourceId && input.dataSourceId.length > 128)
    throw new ServerOperationError({ error: "Invalid data source" }, 400);
  const payload = await getDatabaseExportService({
    dataSourceId: input.dataSourceId,
    databaseId: readable.record.id,
    existingRecord: readable.record,
    userId: readable.user?.id,
  });
  return { ...payload, viewerType: readable.viewerType };
}
export type DatabaseRecordWindowInput = DatabaseBootstrapInput & {
  dataSourceId: string;
  expectedQueryHash: string;
  snapshot?: string;
  offset?: number;
  limit?: number;
};
export async function readDatabaseRecordWindow(
  context: ServerOperationContext,
  input: DatabaseRecordWindowInput,
) {
  const readable = await readableDatabase(context, input.databaseId, input.includeDeleted ?? false);
  if (
    !input.expectedQueryHash ||
    input.expectedQueryHash.length > 64 ||
    input.expectedQueryHash.trim() !== input.expectedQueryHash
  )
    throw new ServerOperationError({ error: "Invalid expected query hash" }, 400);
  if (input.snapshot && input.snapshot.length > 2048)
    throw new ServerOperationError({ error: "Invalid snapshot" }, 400);
  const offset = input.offset ?? 0;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    (input.limit !== undefined &&
      (!Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > MAX_DATABASE_RECORD_WINDOW_LIMIT))
  )
    throw new ServerOperationError({ error: "Invalid record window" }, 400);
  return getDatabaseRecordWindowService({
    ...input,
    offset,
    includeDeleted: input.includeDeleted ?? false,
    databaseId: readable.record.id,
    existingRecord: readable.record,
    userId: readable.user?.id,
  });
}
export async function readDatabaseMutationHistory(
  context: ServerOperationContext,
  input: { databaseId: string; afterVersion: number; limit?: number },
) {
  const readable = await readableDatabase(context, input.databaseId, false);
  const limit = input.limit ?? DATABASE_MUTATION_FEED_LIMIT;
  if (
    !Number.isSafeInteger(input.afterVersion) ||
    input.afterVersion < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > DATABASE_MUTATION_FEED_LIMIT
  )
    throw new ServerOperationError({ error: "Invalid mutation window" }, 400);
  return getDatabaseMutationFeed({
    afterVersion: input.afterVersion,
    databaseId: readable.record.id,
    limit,
  });
}
export async function readDatabaseAccess(
  context: ServerOperationContext,
  input: { databaseId: string },
) {
  requireOperationPolicy(context, { write: false, oauthScope: "databases.read" });
  await requireDatabaseOperationWorkspace(context, input.databaseId);
  const actor = requireOperationActor(context);
  return listDatabaseAccessRulesService({ databaseId: input.databaseId, userId: actor.id });
}
