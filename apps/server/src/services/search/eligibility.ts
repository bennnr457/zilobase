import { sql, type SQL } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import { SEARCH_PROFILE, type SearchChunkMetadata, type SearchChunkKind } from "./vector-contracts";

const validLevel = (column: SQL) => sql`${column} in ('view','comment','edit','full')`;
const principal = (type: SQL, id: SQL, userId: string) =>
  sql`(${type}='user' and ${id}=${userId} or ${type}='team' and exists(select 1 from "teamMember" tm where tm.user_id=${userId} and tm.team_id=${id}) and (select is_member from search_principal))`;

function parentEdges(workspaceId: string, child: SQL) {
  return sql`select pl.parent_id as id from page_item_placement pl join page parent on parent.id=pl.parent_id and parent.workspace_id=${workspaceId} and parent.deleted_at is null
    where pl.workspace_id=${workspaceId} and pl.item_kind='page' and pl.item_id=${child} and pl.parent_kind='page' and pl.deleted_at is null and (pl.placement_kind='primary' or pl.placement_kind='linked' and exists(select 1 from database d where d.workspace_id=${workspaceId} and d.page_id=pl.item_id and d.deleted_at is null))
    union select d.page_id from database_row r join data_source ds on ds.id=r.data_source_id join database d on d.id=ds.parent_database_id join page host on host.id=d.page_id and host.workspace_id=${workspaceId} and host.deleted_at is null
    where r.page_id=${child} and r.deleted_at is null and d.workspace_id=${workspaceId} and d.deleted_at is null`;
}

function teamspaceAllowed(workspaceId: string, teamspace: SQL, userId: string) {
  return sql`exists(select 1 from teamspace t join teamspace_principal tp on tp.teamspace_id=t.id where t.id=${teamspace} and t.workspace_id=${workspaceId} and t.archived_at is null and ${principal(sql`tp.principal_type`, sql`tp.principal_id`, userId)} and (tp.role='owner' or ${validLevel(sql`coalesce(tp.access_level_override,t.member_access_level)`)}))`;
}

function standaloneAllowed(workspaceId: string, database: SQL, userId: string) {
  return sql`exists(select 1 from database d where d.id=${database} and d.workspace_id=${workspaceId} and d.page_id is null and d.deleted_at is null and (select is_member from search_principal) and (
    d.teamspace_id is null and d.created_by_id=${userId} or
    exists(select 1 from database_access a where a.database_id=d.id and a.workspace_id=${workspaceId} and ${principal(sql`a.target_type`, sql`a.target_id`, userId)} and ${validLevel(sql`a.access_level`)}) or
    d.teamspace_id is not null and ${teamspaceAllowed(workspaceId, sql`d.teamspace_id`, userId)}))`;
}

/** Candidate-scoped traversal: no application-side workspace graph, and indexed parent lookups. */
export function searchAccessCtes(
  workspaceId: string,
  userId: string,
  pageIds: readonly string[] | SQL,
  databaseIds: readonly string[] | SQL = [],
) {
  if (
    (Array.isArray(pageIds) && pageIds.length > 2000) ||
    (Array.isArray(databaseIds) && databaseIds.length > 2000)
  )
    throw new Error("SEARCH_ACCESS_BATCH_TOO_LARGE");
  const pageSet = Array.isArray(pageIds)
    ? sql`select jsonb_array_elements_text(${JSON.stringify(pageIds)}::jsonb)`
    : (pageIds as SQL);
  const databaseSet = Array.isArray(databaseIds)
    ? sql`select jsonb_array_elements_text(${JSON.stringify(databaseIds)}::jsonb)`
    : (databaseIds as SQL);
  return sql`with recursive
    search_principal as materialized(select exists(select 1 from member m where m.workspace_id=${workspaceId} and m.user_id=${userId} and (m.role<>'temporary' or m.access_expires_at>clock_timestamp())) as is_member, exists(select 1 from workspace_guest g where g.workspace_id=${workspaceId} and g.user_id=${userId}) as is_guest),
    search_candidates as materialized(select p.id,p.teamspace_id from page p where p.workspace_id=${workspaceId} and p.deleted_at is null and (p.id in(${pageSet}) or p.id in(select d.page_id from database d where d.workspace_id=${workspaceId} and d.id in(${databaseSet}) and d.deleted_at is null))),
    search_ancestors(root_id,id,depth) as (
      select id,id,0 from search_candidates union
      select a.root_id,parents.id,a.depth+1 from search_ancestors a cross join lateral (${parentEdges(workspaceId, sql`a.id`)}) parents where a.depth<64),
    search_explicit as materialized(select distinct ancestors.root_id from search_ancestors ancestors join page_access a on a.page_id=ancestors.id where a.workspace_id=${workspaceId} and ${principal(sql`a.target_type`, sql`a.target_id`, userId)} and ${validLevel(sql`a.access_level`)}),
    search_allowed_pages as materialized(select c.id from search_candidates c cross join search_principal who where (who.is_member or who.is_guest) and not exists(select 1 from search_ancestors a where a.root_id=c.id and a.depth=64) and (
      not who.is_member and (c.teamspace_id is null or exists(select 1 from teamspace t where t.id=c.teamspace_id and t.workspace_id=${workspaceId} and t.archived_at is null and t.guests_enabled)) and exists(select 1 from search_explicit e where e.root_id=c.id)
      or who.is_member and (
        exists(select 1 from search_explicit e where e.root_id=c.id) or
        c.teamspace_id is not null and ${teamspaceAllowed(workspaceId, sql`c.teamspace_id`, userId)} or
        c.teamspace_id is null and (
          exists(select 1 from search_ancestors a join page owner on owner.id=a.id and owner.workspace_id=${workspaceId} where a.root_id=c.id and owner.created_by_id=${userId} and not exists(select 1 from (${parentEdges(workspaceId, sql`a.id`)}) parent)) or
          exists(select 1 from database_row r join data_source ds on ds.id=r.data_source_id where r.page_id=c.id and r.deleted_at is null and ${standaloneAllowed(workspaceId, sql`ds.parent_database_id`, userId)})
        )
      )
    )),
    search_allowed_databases as materialized(select d.id from database d where d.workspace_id=${workspaceId} and d.deleted_at is null and d.id in(${databaseSet}) and (d.page_id is not null and exists(select 1 from search_allowed_pages p where p.id=d.page_id) or ${standaloneAllowed(workspaceId, sql`d.id`, userId)}))`;
}

export async function authorizedSearchIdentities(
  workspaceId: string,
  userId: string,
  pageIds: readonly string[],
  databaseIds: readonly string[] = [],
) {
  const rows = (
    await db.execute<{ kind: string; id: string }>(
      sql`${searchAccessCtes(workspaceId, userId, pageIds, databaseIds)} select 'page' as kind,id from search_allowed_pages union all select 'database',id from search_allowed_databases`,
    )
  ).rows;
  return {
    pages: new Set(rows.filter((r) => r.kind === "page").map((r) => r.id)),
    databases: new Set(rows.filter((r) => r.kind === "database").map((r) => r.id)),
  };
}

export function freshSearchChunk(workspaceId: string, alias: "c" = "c") {
  const c = sql.identifier(alias);
  return sql`${c}.workspace_id=${workspaceId} and ${c}.profile_id=${SEARCH_PROFILE.id} and ${c}.is_active and ${c}.embedding is not null and exists(select 1 from page_search_index i join workspace_search_settings s on s.workspace_id=i.workspace_id join page p on p.id=i.page_id and p.workspace_id=i.workspace_id where i.workspace_id=${c}.workspace_id and i.page_id=${c}.page_id and i.profile_id=${c}.profile_id and s.enabled and s.profile_id=i.profile_id and s.index_epoch=i.index_epoch and ${c}.index_epoch=i.index_epoch and i.active_generation_id=${c}.generation_id and i.indexed_revision=i.requested_revision and ${c}.source_revision=i.indexed_revision and p.deleted_at is null offset 0)`;
}

export function searchVectorAccessCtes(workspaceId: string, userId: string) {
  const pages = sql`select distinct c.page_id from search_chunk c where ${freshSearchChunk(workspaceId)}`;
  const databases = sql`select distinct ds.parent_database_id from database_row r join data_source ds on ds.id=r.data_source_id where r.page_id in(${pages}) and r.deleted_at is null and ds.deleted_at is null and ds.workspace_id=${workspaceId}`;
  return searchAccessCtes(workspaceId, userId, pages, databases);
}
export function liveSearchChunkAllowed(workspaceId: string) {
  return sql`c.page_id in(select id from search_allowed_pages) and (c.chunk_kind<>'property' or exists(
   select 1 from page_property p join page_property_value v on v.property_id=p.id and v.page_id=c.page_id
   join database_property dp on dp.property_id=p.id join data_source ds on ds.id=dp.data_source_id join database_row r on r.data_source_id=ds.id and r.page_id=c.page_id
   where p.id=c.source_key and p.workspace_id=${workspaceId} and p.deleted_at is null and p.search_revision::text=c.metadata->>'definitionRevision' and v.search_revision::text=c.metadata->>'valueRevision'
   and r.deleted_at is null and ds.deleted_at is null and ds.workspace_id=${workspaceId} and ds.parent_database_id in(select id from search_allowed_databases)
 ))`;
}

/** Recheck live property revisions and a currently authorized source exposing that property. */
export async function readAuthorizedSearchChunks(
  workspaceId: string,
  userId: string,
  chunkIds: readonly string[],
) {
  if (!chunkIds.length) return [];
  if (chunkIds.length > 2000) throw new Error("SEARCH_ACCESS_BATCH_TOO_LARGE");
  const selected = sql`select c.page_id from search_chunk c where c.workspace_id=${workspaceId} and c.id in(select jsonb_array_elements_text(${JSON.stringify(chunkIds)}::jsonb)::uuid)`;
  const sources = sql`select distinct ds.parent_database_id from database_row r join data_source ds on ds.id=r.data_source_id where r.page_id in(${selected}) and r.deleted_at is null and ds.deleted_at is null and ds.workspace_id=${workspaceId}`;
  return (
    await db.execute<AuthorizedSearchChunk>(sql`${searchAccessCtes(workspaceId, userId, selected, sources)}
    select c.id,c.page_id,c.chunk_kind,c.content_markdown,c.metadata,p.name,p.updated_at,p.metadata as page_metadata,source.database_id,source.data_source_id,source.record_id
    from search_chunk c join page p on p.id=c.page_id and p.workspace_id=c.workspace_id
    left join lateral (
      select ds.parent_database_id as database_id,ds.id as data_source_id,r.id as record_id from database_row r join data_source ds on ds.id=r.data_source_id join database_property dp on dp.data_source_id=ds.id and dp.property_id=c.source_key
      where r.page_id=c.page_id and r.deleted_at is null and ds.deleted_at is null and ds.workspace_id=${workspaceId} and ds.parent_database_id in(select id from search_allowed_databases) order by ds.id limit 1
    ) source on c.chunk_kind='property'
    where ${freshSearchChunk(workspaceId)} and c.id in(select jsonb_array_elements_text(${JSON.stringify(chunkIds)}::jsonb)::uuid) and c.page_id in(select id from search_allowed_pages)
    and (c.chunk_kind<>'property' or source.database_id is not null and exists(select 1 from page_property definition join page_property_value value on value.property_id=definition.id and value.page_id=c.page_id where definition.id=c.source_key and definition.workspace_id=c.workspace_id and definition.deleted_at is null and definition.search_revision::text=c.metadata->>'definitionRevision' and value.search_revision::text=c.metadata->>'valueRevision'))
  `)
  ).rows;
}
export type AuthorizedSearchChunk = {
  id: string;
  page_id: string;
  chunk_kind: SearchChunkKind;
  content_markdown: string;
  metadata: SearchChunkMetadata;
  name: string;
  updated_at: Date;
  page_metadata: Record<string, unknown> | null;
  database_id: string | null;
  data_source_id: string | null;
  record_id: string | null;
};
export async function authorizedSearchChunks(
  workspaceId: string,
  userId: string,
  chunkIds: readonly string[],
) {
  return new Set(
    (await readAuthorizedSearchChunks(workspaceId, userId, chunkIds)).map((c) => c.id),
  );
}
