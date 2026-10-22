import { sql } from "drizzle-orm";
import { db, runWithDb, type Database } from "../../infrastructure/database";
import { getBackgroundCellId } from "../../infrastructure/background/contracts";
import { getMembership, isPrivilegedOrgRole } from "../access/principal-access";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { scheduleSearchWorkspaceScan } from "./maintenance";
import { nudgeSearchIndexing } from "./invalidation";
import { SEARCH_PROFILE } from "./vector-contracts";

async function authorizeSettings(
  context: ServerOperationContext,
  workspaceId: string,
  write: boolean,
) {
  requireOperationPolicy(context, { write, oauthScope: write ? undefined : "workspaces.read" });
  const user = requireOperationActor(context);
  requireOperationWorkspace(context, workspaceId);
  const membership = await getMembership(workspaceId, user.id);
  if (!membership || (write && !isPrivilegedOrgRole(membership.role)))
    throw new ServerOperationError({ error: "Workspace owner or admin access is required." }, 403);
  return { user, canManage: isPrivilegedOrgRole(membership.role) };
}
function capability(context: ServerOperationContext) {
  const enabled = context.env.SEARCH_EMBEDDINGS_ENABLED === "true";
  const configured =
    typeof context.env.GEMINI_API_KEY === "string" && !!context.env.GEMINI_API_KEY.trim();
  const queueReady = context.runtimePorts.readiness?.background().producerReady !== false;
  return {
    available: enabled && configured && queueReady,
    reason: !enabled
      ? "deployment_disabled"
      : !configured
        ? "missing_credentials"
        : !queueReady
          ? "queue_unavailable"
          : null,
  };
}

export async function getSearchSettingsOperation(
  context: ServerOperationContext,
  input: { workspaceId: string },
) {
  const { canManage } = await authorizeSettings(context, input.workspaceId, false);
  const settings = (
    await db.execute<{
      enabled: boolean;
      profile_id: string;
      index_epoch: string;
      backfill_completed_at: Date | null;
      last_error_code: string | null;
    }>(
      sql`select enabled,profile_id,index_epoch::text,backfill_completed_at,last_error_code from workspace_search_settings where workspace_id=${input.workspaceId} and cell_id=${getBackgroundCellId(context.env)}`,
    )
  ).rows[0];
  const counts = (
    await db.execute<{ status: string; count: string }>(
      sql`select i.status,count(*)::text from page_search_index i join workspace_search_settings s on s.workspace_id=i.workspace_id where i.workspace_id=${input.workspaceId} and s.cell_id=${getBackgroundCellId(context.env)} and i.profile_id=s.profile_id and i.index_epoch=s.index_epoch group by i.status`,
    )
  ).rows;
  const progress = { pending: 0, running: 0, ready: 0, failed: 0 };
  for (const row of counts)
    if (row.status in progress) progress[row.status as keyof typeof progress] = Number(row.count);
  const latest = (
    await db.execute<{ last_success: Date | null; error: string | null }>(
      sql`select max(i.last_indexed_at) as last_success,(array_agg(i.last_error_code order by i.updated_at desc) filter(where i.last_error_code is not null))[1] as error from page_search_index i join workspace_search_settings s on s.workspace_id=i.workspace_id where i.workspace_id=${input.workspaceId} and s.cell_id=${getBackgroundCellId(context.env)} and i.profile_id=s.profile_id and i.index_epoch=s.index_epoch`,
    )
  ).rows[0];
  return {
    workspaceId: input.workspaceId,
    enabled: settings?.enabled ?? false,
    canManage,
    capability: capability(context),
    profile: {
      id: SEARCH_PROFILE.id,
      model: SEARCH_PROFILE.model,
      dimensions: SEARCH_PROFILE.dimensions,
    },
    progress,
    backfillComplete: !!settings?.backfill_completed_at,
    lastIndexedAt: latest?.last_success ?? null,
    lastErrorCode: settings?.last_error_code ?? latest?.error ?? null,
  };
}

export async function updateSearchSettingsOperation(
  context: ServerOperationContext,
  input: { workspaceId: string; body?: unknown },
  readBody: () => Promise<unknown> = async () => input.body,
) {
  const { user } = await authorizeSettings(context, input.workspaceId, true);
  let body: unknown;
  try {
    body = await readBody();
  } catch {
    throw new ServerOperationError({ error: "Invalid JSON" }, 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => k !== "enabled") ||
    !("enabled" in body) ||
    typeof body.enabled !== "boolean"
  )
    throw new ServerOperationError({ error: "enabled must be a boolean" }, 400);
  const enabled = body.enabled;
  if (enabled && !capability(context).available)
    throw new ServerOperationError(
      {
        error: "Configure enabled Gemini search and its queue before enabling this workspace.",
        code: capability(context).reason,
      },
      409,
    );
  await db.transaction(async (tx) =>
    runWithDb(tx as unknown as Database, async () => {
      await tx.execute(
        sql`insert into workspace_search_settings(workspace_id,cell_id,profile_id) values(${input.workspaceId},${getBackgroundCellId(context.env)},${SEARCH_PROFILE.id}) on conflict(workspace_id) do nothing`,
      );
      const previous = (
        await tx.execute<{ enabled: boolean; cell_id: string }>(
          sql`select enabled,cell_id from workspace_search_settings where workspace_id=${input.workspaceId} for update`,
        )
      ).rows[0];
      if (previous.cell_id !== getBackgroundCellId(context.env))
        throw new ServerOperationError({ error: "Workspace search belongs to another cell." }, 403);
      if (previous.enabled === enabled) return;
      await tx.execute(
        sql`update workspace_search_settings set enabled=${enabled},index_epoch=index_epoch+1,enabled_at=case when ${enabled} then now() else enabled_at end,enabled_by=case when ${enabled} then ${user.id} else enabled_by end,last_error_code=null,updated_at=now() where workspace_id=${input.workspaceId}`,
      );
      if (enabled) await scheduleSearchWorkspaceScan(context.env, input.workspaceId);
    }),
  );
  await nudgeSearchIndexing(context.env);
  return getSearchSettingsOperation(context, input);
}

export async function reindexSearchWorkspaceOperation(
  context: ServerOperationContext,
  input: { workspaceId: string },
) {
  await authorizeSettings(context, input.workspaceId, true);
  if (!capability(context).available)
    throw new ServerOperationError({ error: "Search deployment is unavailable." }, 409);
  await db.transaction(async (tx) =>
    runWithDb(tx as unknown as Database, async () => {
      const row = (
        await tx.execute<{
          backfill_completed_at: Date | null;
          backfill_high_water: string | null;
          last_error_code: string | null;
        }>(
          sql`select backfill_completed_at,backfill_high_water,last_error_code from workspace_search_settings where workspace_id=${input.workspaceId} and cell_id=${getBackgroundCellId(context.env)} and enabled for update`,
        )
      ).rows[0];
      if (!row)
        throw new ServerOperationError(
          { error: "Enable workspace search before reindexing." },
          409,
        );
      // Repeated requests while a scan is active are idempotent and retain its cursor.
      if (!row.backfill_completed_at && !row.last_error_code) return;
      await tx.execute(
        sql`update workspace_search_settings set index_epoch=index_epoch+1,last_error_code=null where workspace_id=${input.workspaceId}`,
      );
      await scheduleSearchWorkspaceScan(context.env, input.workspaceId);
    }),
  );
  await nudgeSearchIndexing(context.env);
  return getSearchSettingsOperation(context, input);
}
