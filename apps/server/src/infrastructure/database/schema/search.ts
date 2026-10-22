import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { timestampColumns, tsvector } from "./columns";
import { page } from "./pages";
import { user } from "./authentication";
import { workspace } from "./workspaces";

export const searchDocument = pgTable(
  "search_document",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourcePageId: text("source_page_id"),
    title: text("title").notNull(),
    path: text("path").notNull(),
    emoji: text("emoji"),
    contentText: text("content_text").notNull().default(""),
    searchVector: tsvector("search_vector").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("search_document_source_unique").on(
      table.workspaceId,
      table.sourceType,
      table.sourceId,
    ),
    index("search_document_workspace_type_updated_idx").on(
      table.workspaceId,
      table.sourceType,
      table.sourceUpdatedAt,
    ),
  ],
);

export const searchEmbeddingProfile = pgTable("search_embedding_profile", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  dimensions: integer("dimensions").notNull(),
  distance: text("distance").notNull(),
  serializerVersion: integer("serializer_version").notNull(),
  propertySerializerVersion: integer("property_serializer_version").notNull(),
  chunkerVersion: integer("chunker_version").notNull(),
  documentPromptVersion: integer("document_prompt_version").notNull(),
  queryPromptVersion: integer("query_prompt_version").notNull(),
  chunkTargetBytes: integer("chunk_target_bytes").notNull(),
  chunkOverlapBytes: integer("chunk_overlap_bytes").notNull(),
  maxInputBytes: integer("max_input_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
const profileColumn = () =>
  text("profile_id")
    .notNull()
    .references(() => searchEmbeddingProfile.id);
const clockColumn = (name: string) => bigint(name, { mode: "bigint" }).notNull();
const timeColumn = (name: string) => timestamp(name, { withTimezone: true });
export const workspaceSearchSettings = pgTable("workspace_search_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  cellId: text("cell_id").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  profileId: profileColumn(),
  indexEpoch: clockColumn("index_epoch").default(1n),
  enabledAt: timeColumn("enabled_at"),
  enabledBy: text("enabled_by").references(() => user.id, { onDelete: "set null" }),
  backfillCursor: text("backfill_cursor"),
  backfillHighWater: text("backfill_high_water"),
  backfillCompletedAt: timeColumn("backfill_completed_at"),
  lastErrorCode: text("last_error_code"),
  ...timestampColumns(),
});
export const pageSearchIndex = pgTable(
  "page_search_index",
  {
    workspaceId: text("workspace_id").notNull(),
    pageId: text("page_id").notNull(),
    profileId: profileColumn(),
    indexEpoch: clockColumn("index_epoch"),
    requestedRevision: clockColumn("requested_revision").default(1n),
    indexedRevision: clockColumn("indexed_revision").default(0n),
    status: text("status").default("pending").notNull(),
    firstDirtyAt: timeColumn("first_dirty_at").defaultNow().notNull(),
    notBefore: timeColumn("not_before").defaultNow().notNull(),
    pendingTaskId: uuid("pending_task_id"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timeColumn("lease_expires_at"),
    leaseFence: clockColumn("lease_fence").default(0n),
    activeGenerationId: uuid("active_generation_id"),
    stagedGenerationId: uuid("staged_generation_id"),
    stagedRevision: bigint("staged_revision", { mode: "bigint" }),
    expectedChunkCount: integer("expected_chunk_count"),
    completedChunkCount: integer("completed_chunk_count").default(0).notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    lastErrorCode: text("last_error_code"),
    lastIndexedAt: timeColumn("last_indexed_at"),
    ...timestampColumns(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.pageId, t.profileId] }),
    foreignKey({ columns: [t.workspaceId, t.pageId], foreignColumns: [page.workspaceId, page.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
  ],
);

// Physical HASH partitions and partial indexes are owned by the SQL migrations.
export const searchChunk = pgTable(
  "search_chunk",
  {
    id: uuid("id").defaultRandom().notNull(),
    workspaceId: text("workspace_id").notNull(),
    pageId: text("page_id").notNull(),
    profileId: profileColumn(),
    indexEpoch: clockColumn("index_epoch"),
    generationId: uuid("generation_id").notNull(),
    sourceRevision: clockColumn("source_revision"),
    chunkKind: text("chunk_kind").notNull(),
    sourceKey: text("source_key").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    contentMarkdown: text("content_markdown").notNull(),
    embeddingInputHash: text("embedding_input_hash").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    isActive: boolean("is_active").notNull().default(false),
    byteCount: integer("byte_count").notNull(),
    tokenCount: integer("token_count"),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestampColumns(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    foreignKey({ columns: [t.workspaceId, t.pageId], foreignColumns: [page.workspaceId, page.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("search_chunk_generation_unique").on(
      t.workspaceId,
      t.pageId,
      t.profileId,
      t.generationId,
      t.chunkKind,
      t.sourceKey,
      t.chunkIndex,
    ),
  ],
);
export const searchInvalidation = pgTable("search_invalidation", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  resourceId: text("resource_id").notNull(),
  revision: clockColumn("revision"),
  cursor: text("cursor"),
  status: text("status").notNull().default("pending"),
  pendingTaskId: uuid("pending_task_id"),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timeColumn("lease_expires_at"),
  leaseFence: clockColumn("lease_fence").default(0n),
  lastErrorCode: text("last_error_code"),
  ...timestampColumns(),
});
export const searchQueryEmbeddingCache = pgTable(
  "search_query_embedding_cache",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    profileId: profileColumn(),
    purpose: text("purpose").notNull(),
    inputHash: text("input_hash").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timeColumn("created_at").defaultNow().notNull(),
    expiresAt: timeColumn("expires_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId, t.profileId, t.purpose, t.inputHash] })],
);
export const searchEmbeddingUsageBucket = pgTable(
  "search_embedding_usage_bucket",
  {
    quotaScope: text("quota_scope").notNull(),
    bucketScope: text("bucket_scope").notNull(),
    windowStart: timeColumn("window_start").notNull(),
    windowKind: text("window_kind").notNull(),
    trafficClass: text("traffic_class").notNull(),
    requests: clockColumn("requests").default(0n),
    reservedTokens: clockColumn("reserved_tokens").default(0n),
    reportedTokens: clockColumn("reported_tokens").default(0n),
    cooldownUntil: timeColumn("cooldown_until"),
    updatedAt: timeColumn("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.quotaScope, t.bucketScope, t.windowStart, t.windowKind, t.trafficClass],
    }),
  ],
);
