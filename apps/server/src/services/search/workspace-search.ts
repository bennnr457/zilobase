import { getDatabaseEmoji, type DataSourceEntity } from "@zilobase/features/runtime";
import { getDatabaseTitleSourcesService } from "../databases/read/service";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "../../infrastructure/database";
import {
  database,
  databaseView,
  databaseDataSource,
  dataSource,
  page,
  searchDocument,
} from "../../infrastructure/database/schema";
import { authorizedSearchIdentities, withSearchRead } from "./eligibility";
import { getMembership } from "../access/principal-access";

export type WorkspaceSearchResult = {
  emoji: string | null;
  excerpt: string | null;
  id: string;
  path: string;
  title: string;
  type: "database" | "page";
  updatedAt: Date;
  entity: unknown;
  titleSource?: DataSourceEntity | null;
  match?: SearchMatchProvenance;
};

export type { SearchMatchProvenance } from "@zilobase/features/search";
import type { SearchMatchProvenance } from "@zilobase/features/search";
export type WorkspaceSearchInput = {
  limit?: number;
  membershipVerified?: boolean;
  query: string;
  types?: Array<WorkspaceSearchResult["type"]>;
  userId: string;
  workspaceId: string;
};

const DEFAULT_MAX_SEARCH_RESULTS = 50;
const MAX_SEARCH_RESULTS = 100;
const MAX_SEARCH_EXCERPT_CHARS = 280;
const SEARCH_HEADLINE_START = "__ZILOBASE_MATCH_START__";
const SEARCH_HEADLINE_STOP = "__ZILOBASE_MATCH_STOP__";
export const SEARCH_HEADLINE_OPTIONS = `MaxWords=35, MinWords=10, StartSel=${SEARCH_HEADLINE_START}, StopSel=${SEARCH_HEADLINE_STOP}`;

export async function searchWorkspaceItems(input: WorkspaceSearchInput) {
  return withSearchRead(() => readWorkspaceSearchItems(input));
}
async function readWorkspaceSearchItems(input: WorkspaceSearchInput) {
  if (!input.membershipVerified && !(await getMembership(input.workspaceId, input.userId))) {
    return [];
  }

  const query = normalizeSearchQuery(input.query);
  const requestedTypes = new Set(input.types ?? ["page", "database"]);
  const limit = Math.max(
    1,
    Math.min(input.limit ?? DEFAULT_MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS),
  );

  const types = [...requestedTypes];
  if (types.length === 0) return [];
  const candidateLimit = Math.min(Math.max(limit * 5, 50), 500);
  const tsQuery = query ? sql`websearch_to_tsquery('simple', ${query})` : null;
  const matchingViewDatabaseIds =
    tsQuery && requestedTypes.has("database")
      ? (
          await db
            .selectDistinct({ databaseId: databaseView.databaseId })
            .from(databaseView)
            .innerJoin(database, eq(database.id, databaseView.databaseId))
            .where(
              and(
                eq(database.workspaceId, input.workspaceId),
                isNull(database.deletedAt),
                sql`to_tsvector('simple', ${databaseView.name}) @@ ${tsQuery}`,
              ),
            )
            .limit(candidateLimit)
        ).map((match) => match.databaseId)
      : [];
  // Source titles are authoritative and may never have been copied into the
  // legacy host search document. Match them directly, checking foreign access
  // before allowing a source name to make its host discoverable.
  const sourceMatches =
    tsQuery && requestedTypes.has("database")
      ? await db
          .select({ databaseId: database.id, parentDatabaseId: dataSource.parentDatabaseId })
          .from(databaseDataSource)
          .innerJoin(database, eq(database.id, databaseDataSource.databaseId))
          .innerJoin(dataSource, eq(dataSource.id, databaseDataSource.dataSourceId))
          .where(
            and(
              eq(database.workspaceId, input.workspaceId),
              isNull(database.deletedAt),
              isNull(dataSource.deletedAt),
              sql`to_tsvector('simple', ${dataSource.name}) @@ ${tsQuery}`,
            ),
          )
          .limit(candidateLimit)
      : [];
  const sourceAccess = await authorizedSearchIdentities(
    input.workspaceId,
    input.userId,
    [],
    [...new Set(sourceMatches.map((m) => m.parentDatabaseId))],
  );
  for (const match of sourceMatches)
    if (
      match.databaseId === match.parentDatabaseId ||
      sourceAccess.databases.has(match.parentDatabaseId)
    )
      matchingViewDatabaseIds.push(match.databaseId);
  const excerpt = tsQuery
    ? sql<
        string | null
      >`nullif(ts_headline('simple', ${searchDocument.contentText}, ${tsQuery}, ${SEARCH_HEADLINE_OPTIONS}), '')`
    : sql<
        string | null
      >`nullif(left(${searchDocument.contentText}, ${MAX_SEARCH_EXCERPT_CHARS}), '')`;
  const rank = tsQuery ? sql<number>`ts_rank_cd(${searchDocument.searchVector}, ${tsQuery})` : null;
  const candidates = await db
    .select({
      emoji: searchDocument.emoji,
      excerpt,
      id: searchDocument.sourceId,
      path: searchDocument.path,
      sourcePageId: searchDocument.sourcePageId,
      title: searchDocument.title,
      type: searchDocument.sourceType,
      updatedAt: searchDocument.sourceUpdatedAt,
    })
    .from(searchDocument)
    .where(
      and(
        eq(searchDocument.workspaceId, input.workspaceId),
        inArray(searchDocument.sourceType, types),
        tsQuery
          ? or(
              sql`${searchDocument.searchVector} @@ ${tsQuery}`,
              matchingViewDatabaseIds.length
                ? and(
                    eq(searchDocument.sourceType, "database"),
                    inArray(searchDocument.sourceId, matchingViewDatabaseIds),
                  )
                : undefined,
            )
          : undefined,
      ),
    )
    .orderBy(...(rank ? [desc(rank), searchDocument.title] : [searchDocument.title]))
    .limit(candidateLimit);

  const allowed = await authorizedSearchIdentities(
    input.workspaceId,
    input.userId,
    candidates.filter((c) => c.type === "page").map((c) => c.id),
    candidates.filter((c) => c.type === "database").map((c) => c.id),
  );
  const visible = candidates
    .filter((c) =>
      c.type === "page"
        ? allowed.pages.has(c.id)
        : c.type === "database" && allowed.databases.has(c.id),
    )
    .slice(0, limit);
  const pageIds = visible.filter((item) => item.type === "page").map((item) => item.id);
  const hostIds = visible.filter((item) => item.type === "database").map((item) => item.id);
  const [pages, hosts] = await Promise.all([
    pageIds.length
      ? db
          .select({
            id: page.id,
            name: page.name,
            workspaceId: page.workspaceId,
            metadata: page.metadata,
            updatedAt: page.updatedAt,
            deletedAt: page.deletedAt,
          })
          .from(page)
          .where(
            and(
              eq(page.workspaceId, input.workspaceId),
              inArray(page.id, pageIds),
              isNull(page.deletedAt),
            ),
          )
      : [],
    hostIds.length
      ? db
          .select()
          .from(database)
          .where(
            and(
              eq(database.workspaceId, input.workspaceId),
              inArray(database.id, hostIds),
              isNull(database.deletedAt),
            ),
          )
      : [],
  ]);
  const pagesById = new Map(pages.map((entity) => [entity.id, entity]));
  const hostsById = new Map(hosts.map((entity) => [entity.id, entity]));
  const titleSources = await getDatabaseTitleSourcesService(
    hosts,
    input.userId,
    async (records) =>
      (
        await authorizedSearchIdentities(
          input.workspaceId,
          input.userId,
          [],
          records.map((r) => r.id),
        )
      ).databases,
  );
  const finalAccess = await authorizedSearchIdentities(input.workspaceId, input.userId, pageIds, [
    ...hostIds,
    ...[...titleSources.values()].flatMap((s) => (s ? [s.parentDatabaseId] : [])),
  ]);
  // Index ordering and snippets remain contextual. Labels carry storage clocks,
  // so an index refresh cannot regress an already confirmed shared entity.
  return visible.flatMap((candidate): WorkspaceSearchResult[] => {
    const entity =
      candidate.type === "page" ? pagesById.get(candidate.id) : hostsById.get(candidate.id);
    if (
      !entity ||
      !(candidate.type === "page"
        ? finalAccess.pages.has(candidate.id)
        : finalAccess.databases.has(candidate.id))
    )
      return [];
    const source = candidate.type === "database" ? titleSources.get(candidate.id) : undefined;
    const titleSource =
      source && finalAccess.databases.has(source.parentDatabaseId) ? source : undefined;
    return [
      {
        emoji: titleSource ? getDatabaseEmoji(titleSource) : candidate.emoji,
        excerpt: candidate.type === "page" ? stripSearchHeadlineMarkers(candidate.excerpt) : null,
        id: candidate.id,
        path: candidate.path,
        title: titleSource?.name ?? entity.name,
        type: candidate.type as WorkspaceSearchResult["type"],
        updatedAt: entity.updatedAt,
        entity,
        ...(candidate.type === "database" ? { titleSource: titleSource ?? null } : {}),
      },
    ];
  });
}

export function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function extractContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!content || typeof content !== "object") {
    return "";
  }

  if (Array.isArray(content)) {
    return content.map(extractContentText).filter(Boolean).join(" ");
  }

  const node = content as { content?: unknown; text?: unknown };
  const ownText = typeof node.text === "string" ? node.text : "";
  const childText = extractContentText(node.content);

  return [ownText, childText].filter(Boolean).join(" ");
}

export function stripSearchHeadlineMarkers(value: string | null) {
  return value?.replaceAll(SEARCH_HEADLINE_START, "").replaceAll(SEARCH_HEADLINE_STOP, "") ?? null;
}

function buildSearchExcerpt(content: string, query: string) {
  const normalizedContent = content.trim().replace(/\s+/g, " ");

  if (!normalizedContent) {
    return null;
  }

  if (!query) {
    return truncateExcerpt(normalizedContent);
  }

  const matchIndex = normalizedContent.toLowerCase().indexOf(query);

  if (matchIndex < 0) {
    return truncateExcerpt(normalizedContent);
  }

  const contextChars = Math.floor(MAX_SEARCH_EXCERPT_CHARS / 2);
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(normalizedContent.length, matchIndex + query.length + contextChars);
  const excerpt = normalizedContent.slice(start, end);

  return `${start > 0 ? "…" : ""}${excerpt}${end < normalizedContent.length ? "…" : ""}`;
}

function truncateExcerpt(value: string) {
  return value.length <= MAX_SEARCH_EXCERPT_CHARS
    ? value
    : `${value.slice(0, MAX_SEARCH_EXCERPT_CHARS)}…`;
}
