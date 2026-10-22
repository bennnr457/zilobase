import { sql } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import {
  createBackgroundTask,
  getBackgroundCellId,
  type BackgroundTaskResult,
  type BackgroundTaskV2,
} from "../../infrastructure/background/contracts";
import { persistBackgroundTasks } from "../../infrastructure/background/publication";
import type { RuntimeEnv } from "../../shared/config/config";
import { chunkPageMarkdown } from "./chunking";
import { chunkStoredProperties, type StoredSearchProperty } from "./property-chunks";
import { embedSearchDocuments, SearchBudgetDeferred } from "./embedding-usage";
import { SearchEmbeddingError, validateSearchVector } from "./gemini";
import {
  SEARCH_PROFILE,
  type PreparedSearchChunk,
  type SearchEmbeddingProvider,
} from "./vector-contracts";

type Claim = {
  workspace_id: string;
  page_id: string;
  profile_id: string;
  index_epoch: string;
  requested_revision: string;
  lease_fence: string;
  staged_generation_id: string | null;
  staged_revision: string | null;
  consecutive_failures: number;
};
export type SearchTaskInput = {
  env: RuntimeEnv;
  task: BackgroundTaskV2;
  workerId: string;
  signal?: AbortSignal;
};
const owned = (c: Claim, worker: string) =>
  sql`i.workspace_id=${c.workspace_id} and i.page_id=${c.page_id} and i.profile_id=${c.profile_id} and i.lease_fence=${c.lease_fence}::bigint and i.lease_owner=${worker}`;
const current = (c: Claim, worker: string) =>
  sql`${owned(c, worker)} and i.requested_revision=${c.requested_revision}::bigint and i.index_epoch=${c.index_epoch}::bigint and i.lease_expires_at>clock_timestamp() and exists(select 1 from workspace_search_settings s where s.workspace_id=i.workspace_id and s.enabled and s.index_epoch=i.index_epoch and s.profile_id=i.profile_id)`;

async function claimPage(input: SearchTaskInput) {
  return (
    await db.execute<Claim>(sql`update page_search_index i set status='running',lease_owner=${input.workerId},lease_expires_at=clock_timestamp()+interval '90 seconds',lease_fence=i.lease_fence+1,updated_at=now()
    from workspace_search_settings s where i.page_id=${input.task.resourceId} and i.profile_id=${SEARCH_PROFILE.id} and s.workspace_id=i.workspace_id and s.cell_id=${getBackgroundCellId(input.env)} and s.enabled and s.profile_id=i.profile_id and s.index_epoch=i.index_epoch
    and i.requested_revision>i.indexed_revision and i.status in ('pending','running') and i.not_before<=clock_timestamp()
    and (i.lease_expires_at is null or i.lease_expires_at<=clock_timestamp()) and i.pending_task_id=${input.task.taskId}::uuid returning i.*`)
  ).rows[0];
}

async function deferEarlyPage(input: SearchTaskInput) {
  await db.transaction(async (tx) => {
    const row = (
      await tx.execute<{ workspace_id: string; not_before: string }>(
        sql`select i.workspace_id,i.not_before::text from page_search_index i join workspace_search_settings s on s.workspace_id=i.workspace_id where i.page_id=${input.task.resourceId} and i.profile_id=s.profile_id and i.index_epoch=s.index_epoch and s.enabled and s.cell_id=${getBackgroundCellId(input.env)} and i.pending_task_id=${input.task.taskId}::uuid and i.not_before>clock_timestamp() and (i.lease_expires_at is null or i.lease_expires_at<=clock_timestamp()) for update of i`,
      )
    ).rows[0];
    if (!row) return;
    const next = createBackgroundTask({
      env: input.env,
      kind: "search.page_index",
      resourceId: input.task.resourceId,
      availableAt: new Date(row.not_before),
    });
    await persistBackgroundTasks(input.env, [next], tx, `search:${next.taskId}`);
    await tx.execute(
      sql`update page_search_index set pending_task_id=${next.taskId}::uuid where workspace_id=${row.workspace_id} and page_id=${input.task.resourceId} and pending_task_id=${input.task.taskId}::uuid`,
    );
  });
}

async function sourceSnapshot(c: Claim): Promise<PreparedSearchChunk[]> {
  const source = await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read, read only`);
    const page = (
      await tx.execute<{ name: string; content: unknown; deleted_at: string | null }>(
        sql`select name,content,deleted_at from page where workspace_id=${c.workspace_id} and id=${c.page_id}`,
      )
    ).rows[0];
    const properties = (
      await tx.execute<StoredSearchProperty>(sql`
      select p.id,p.name,p.type,p.config,v.value,p.search_revision::text as "definitionRevision",v.search_revision::text as "valueRevision"
      from page_property_value v join page_property p on p.id=v.property_id
      where v.page_id=${c.page_id} and p.workspace_id=${c.workspace_id} and p.deleted_at is null
      and exists(select 1 from database_row r join data_source s on s.id=r.data_source_id join database d on d.id=s.parent_database_id join database_property dp on dp.data_source_id=s.id and dp.property_id=p.id
        where r.page_id=v.page_id and r.deleted_at is null and s.deleted_at is null and d.deleted_at is null and s.workspace_id=${c.workspace_id} and d.workspace_id=${c.workspace_id})
    `)
    ).rows;
    return { page, properties };
  });
  if (!source.page || source.page.deleted_at) return [];
  return [
    ...chunkPageMarkdown(source.page.name, source.page.content),
    ...chunkStoredProperties(source.page.name, source.properties),
  ];
}

async function prepareGeneration(c: Claim, worker: string, chunks: PreparedSearchChunk[]) {
  const generation =
    c.staged_revision === c.requested_revision && c.staged_generation_id
      ? c.staged_generation_id
      : crypto.randomUUID();
  return db.transaction(async (tx) => {
    const state = (
      await tx.execute(
        sql`select 1 from page_search_index i where ${current(c, worker)} for update`,
      )
    ).rows;
    if (!state.length) return undefined;
    if (generation !== c.staged_generation_id) {
      const manifest = chunks.map((chunk) => ({
        id: crypto.randomUUID(),
        kind: chunk.kind,
        key: chunk.sourceKey,
        position: chunk.index,
        markdown: chunk.markdown,
        hash: chunk.inputHash,
        bytes: chunk.byteCount,
        metadata: chunk.metadata,
      }));
      if (manifest.length)
        await tx.execute(sql`insert into search_chunk(id,workspace_id,page_id,profile_id,index_epoch,generation_id,source_revision,chunk_kind,source_key,chunk_index,content_markdown,embedding_input_hash,byte_count,metadata)
        select x.id,${c.workspace_id},${c.page_id},${c.profile_id},${c.index_epoch}::bigint,${generation}::uuid,${c.requested_revision}::bigint,x.kind,x.key,x.position,x.markdown,x.hash,x.bytes,x.metadata
        from jsonb_to_recordset(${JSON.stringify(manifest)}::jsonb) as x(id uuid,kind text,key text,position integer,markdown text,hash text,bytes integer,metadata jsonb)`);
      await tx.execute(
        sql`update page_search_index i set staged_generation_id=${generation}::uuid,staged_revision=${c.requested_revision}::bigint,expected_chunk_count=${chunks.length},completed_chunk_count=0 where ${current(c, worker)}`,
      );
    }
    // Reuse only the exact input in the same workspace and immutable embedding space.
    await tx.execute(sql`update search_chunk target set embedding=(select old.embedding from search_chunk old where old.workspace_id=target.workspace_id and old.profile_id=target.profile_id and old.embedding_input_hash=target.embedding_input_hash and old.embedding is not null order by old.created_at desc limit 1)
      where target.workspace_id=${c.workspace_id} and target.page_id=${c.page_id} and target.generation_id=${generation}::uuid and target.embedding is null`);
    return generation;
  });
}

async function renew(c: Claim, worker: string) {
  return (
    (
      await db.execute(
        sql`update page_search_index i set lease_expires_at=clock_timestamp()+interval '90 seconds' where ${current(c, worker)} returning i.page_id`,
      )
    ).rows.length > 0
  );
}

async function checkpoint(
  c: Claim,
  worker: string,
  generation: string,
  values: Array<{ id: string; vector: number[] }>,
) {
  return db.transaction(async (tx) => {
    if (
      !(
        await tx.execute(
          sql`select 1 from page_search_index i where ${current(c, worker)} for update`,
        )
      ).rows.length
    )
      return false;
    await tx.execute(sql`update search_chunk ch set embedding=x.vector::vector,updated_at=now() from jsonb_to_recordset(${JSON.stringify(values.map((v) => ({ id: v.id, vector: JSON.stringify(v.vector) })))}::jsonb) as x(id uuid,vector text)
      where ch.workspace_id=${c.workspace_id} and ch.page_id=${c.page_id} and ch.generation_id=${generation}::uuid and ch.id=x.id`);
    await tx.execute(
      sql`update page_search_index i set completed_chunk_count=(select count(*) from search_chunk ch where ch.workspace_id=i.workspace_id and ch.page_id=i.page_id and ch.generation_id=${generation}::uuid and ch.embedding is not null) where ${current(c, worker)}`,
    );
    return true;
  });
}

async function activate(c: Claim, worker: string, generation: string) {
  return db.transaction(async (tx) => {
    if (
      !(
        await tx.execute(
          sql`select 1 from page_search_index i where ${current(c, worker)} and i.staged_generation_id=${generation}::uuid and i.staged_revision=i.requested_revision and i.expected_chunk_count=(select count(*) from search_chunk ch where ch.workspace_id=i.workspace_id and ch.page_id=i.page_id and ch.generation_id=i.staged_generation_id and ch.embedding is not null) for update`,
        )
      ).rows.length
    )
      return false;
    await tx.execute(
      sql`update search_chunk set is_active=false where workspace_id=${c.workspace_id} and page_id=${c.page_id} and profile_id=${c.profile_id} and is_active`,
    );
    await tx.execute(
      sql`update search_chunk set is_active=true where workspace_id=${c.workspace_id} and page_id=${c.page_id} and generation_id=${generation}::uuid`,
    );
    await tx.execute(
      sql`update page_search_index i set active_generation_id=${generation}::uuid,indexed_revision=requested_revision,status='ready',pending_task_id=null,lease_owner=null,lease_expires_at=null,consecutive_failures=0,last_error_code=null,last_indexed_at=now(),updated_at=now() where ${current(c, worker)}`,
    );
    return true;
  });
}

async function continuePage(
  input: SearchTaskInput,
  c: Claim,
  availableAt: Date,
  errorCode?: string,
) {
  await db.transaction(async (tx) => {
    if (
      !(
        await tx.execute(
          sql`select 1 from page_search_index i where ${current(c, input.workerId)} for update`,
        )
      ).rows.length
    )
      return;
    const next = createBackgroundTask({
      env: input.env,
      kind: "search.page_index",
      resourceId: c.page_id,
      availableAt,
    });
    await persistBackgroundTasks(input.env, [next], tx, `search:${next.taskId}`);
    await tx.execute(
      sql`update page_search_index i set status='pending',not_before=${availableAt.toISOString()}::timestamptz,pending_task_id=${next.taskId}::uuid,lease_owner=null,lease_expires_at=null,last_error_code=${errorCode ?? null},consecutive_failures=consecutive_failures+${errorCode && errorCode !== "SEARCH_RATE_LIMIT" && errorCode !== "SEARCH_DAILY_BUDGET" && errorCode !== "SEARCH_PROVIDER_COOLDOWN" ? 1 : 0},updated_at=now() where ${current(c, input.workerId)}`,
    );
  });
}

async function releaseObsolete(c: Claim, worker: string) {
  await db.execute(
    sql`update page_search_index i set status='pending',pending_task_id=null,lease_owner=null,lease_expires_at=null,updated_at=now() where ${owned(c, worker)} and i.status in ('running','pending')`,
  );
}

export async function indexSearchPage(
  input: SearchTaskInput,
  options: { provider?: SearchEmbeddingProvider; workBudgetMs?: number } = {},
): Promise<BackgroundTaskResult> {
  if (input.env.SEARCH_EMBEDDINGS_ENABLED !== "true") return { outcome: "noop" };
  const started = Date.now();
  const c = await claimPage(input);
  if (!c) {
    await deferEarlyPage(input);
    return { outcome: "noop" };
  }
  try {
    const chunks = await sourceSnapshot(c);
    const generation = await prepareGeneration(c, input.workerId, chunks);
    if (!generation) {
      await releaseObsolete(c, input.workerId);
      return { outcome: "noop" };
    }
    const missing = (
      await db.execute<{ id: string; embedding_input_hash: string }>(
        sql`select id,embedding_input_hash from search_chunk where workspace_id=${c.workspace_id} and page_id=${c.page_id} and generation_id=${generation}::uuid and embedding is null order by chunk_kind,source_key,chunk_index`,
      )
    ).rows;
    const byHash = new Map(chunks.map((ch) => [ch.inputHash, ch.input]));
    for (let at = 0; at < missing.length; at += 16) {
      input.signal?.throwIfAborted();
      // Leave a full provider timeout plus checkpoint time within the invocation budget.
      if (Date.now() - started > (options.workBudgetMs ?? 45000) - 21000) {
        await continuePage(input, c, new Date());
        return { outcome: "completed" };
      }
      if (!(await renew(c, input.workerId))) {
        await releaseObsolete(c, input.workerId);
        return { outcome: "noop" };
      }
      const batch = missing.slice(at, at + 16);
      const inputs = batch.map((ch) => {
        const text = byHash.get(ch.embedding_input_hash);
        if (!text) throw new SearchEmbeddingError("SEARCH_MANIFEST_MISMATCH", false);
        return text;
      });
      const embedded = await embedSearchDocuments(
        input.env,
        c.workspace_id,
        inputs,
        input.signal,
        options.provider,
      );
      if (embedded.embeddings.length !== batch.length)
        throw new SearchEmbeddingError("SEARCH_PROVIDER_RESPONSE_INVALID", false);
      if (
        !(await checkpoint(
          c,
          input.workerId,
          generation,
          batch.map((ch, i) => ({
            id: ch.id,
            vector: validateSearchVector(embedded.embeddings[i]),
          })),
        ))
      ) {
        await releaseObsolete(c, input.workerId);
        return { outcome: "noop" };
      }
    }
    if (!(await activate(c, input.workerId, generation))) await releaseObsolete(c, input.workerId);
    return { outcome: "completed" };
  } catch (error) {
    if (error instanceof SearchBudgetDeferred) {
      await continuePage(input, c, new Date(error.availableAt), error.code);
      return { outcome: "completed" };
    }
    const retryable =
      input.signal?.aborted || (error instanceof SearchEmbeddingError && error.retryable);
    const code =
      error instanceof SearchEmbeddingError
        ? error.code
        : input.signal?.aborted
          ? "SEARCH_INTERRUPTED"
          : "SEARCH_INDEX_FAILED";
    if (retryable && c.consecutive_failures < 4) {
      await continuePage(
        input,
        c,
        new Date(Date.now() + Math.min(60000, 1000 * 2 ** c.consecutive_failures)),
        code,
      );
      return { outcome: "completed" };
    }
    await db.execute(
      sql`update page_search_index i set status='failed',pending_task_id=null,lease_owner=null,lease_expires_at=null,consecutive_failures=consecutive_failures+1,last_error_code=${code},updated_at=now() where ${current(c, input.workerId)}`,
    );
    await releaseObsolete(c, input.workerId);
    return { outcome: "terminal", errorCode: code };
  }
}
