import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { BuildContextResult, ResourceRef } from "@zilobase/page-context";
import { user } from "./authentication";
import { workspace } from "./workspaces";
import { timestampColumns } from "./columns";

export const askAiThread = pgTable(
  "ask_ai_thread",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("ask_ai_thread_owner_idx").on(table.workspaceId, table.userId, table.updatedAt),
  ],
);

export const askAiTurn = pgTable(
  "ask_ai_turn",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => askAiThread.id, { onDelete: "cascade" }),
    requestHash: text("request_hash").notNull(),
    userText: text("user_text").notNull(),
    assistantText: text("assistant_text").notNull().default(""),
    status: text("status").notNull().default("streaming"),
    roots: jsonb("roots").$type<ResourceRef[]>().notNull(),
    // Coverage and IDs only. Full page/database snapshots are not retained.
    context: jsonb("context").$type<Omit<BuildContextResult, "markdown">>().notNull(),
    usage: jsonb("usage").$type<{ inputTokens?: number; outputTokens?: number }>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("ask_ai_turn_thread_idx").on(table.threadId, table.createdAt),
    check(
      "ask_ai_turn_status_check",
      sql`${table.status} in ('streaming', 'completed', 'stopped', 'failed', 'interrupted')`,
    ),
  ],
);
