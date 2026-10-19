CREATE TABLE "ask_ai_thread" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ask_ai_thread_owner_idx" ON "ask_ai_thread" ("workspace_id", "user_id", "updated_at");
--> statement-breakpoint
CREATE TABLE "ask_ai_turn" (
  "id" text PRIMARY KEY NOT NULL,
  "thread_id" text NOT NULL REFERENCES "ask_ai_thread"("id") ON DELETE CASCADE,
  "request_hash" text NOT NULL,
  "user_text" text NOT NULL,
  "assistant_text" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'streaming' NOT NULL,
  "roots" jsonb NOT NULL,
  "context" jsonb NOT NULL,
  "usage" jsonb,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ask_ai_turn_status_check" CHECK ("status" IN ('streaming', 'completed', 'stopped', 'failed', 'interrupted'))
);
--> statement-breakpoint
CREATE INDEX "ask_ai_turn_thread_idx" ON "ask_ai_turn" ("thread_id", "created_at");
