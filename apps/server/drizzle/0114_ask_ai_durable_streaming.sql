CREATE TABLE "ask_ai_run" (
 "id" text PRIMARY KEY NOT NULL,
 "turn_id" text NOT NULL UNIQUE REFERENCES "ask_ai_turn"("id") ON DELETE CASCADE,
 "thread_id" text NOT NULL REFERENCES "ask_ai_thread"("id") ON DELETE CASCADE,
 "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
 "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
 "session_id" text NOT NULL,
 "cell_id" text NOT NULL,
 "model" text NOT NULL,
 "background" boolean NOT NULL DEFAULT false,
 "status" text NOT NULL DEFAULT 'queued',
 "seq" integer NOT NULL DEFAULT 0,
 "fence" integer NOT NULL DEFAULT 0,
 "lease_owner" text,
 "lease_expires_at" timestamptz,
 "provider_started_at" timestamptz,
 "response_id" text,
 "provider_cursor" integer,
 "cancel_requested_at" timestamptz,
 "completed_at" timestamptz,
 "deadline_at" timestamptz NOT NULL,
 "created_at" timestamptz NOT NULL DEFAULT now(),
 "updated_at" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "ask_ai_run_status_check" CHECK ("status" IN ('queued','running','completed','stopped','failed','interrupted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ask_ai_run_active_thread_idx" ON "ask_ai_run"("thread_id") WHERE "status" IN ('queued','running');
--> statement-breakpoint
CREATE INDEX "ask_ai_run_owner_idx" ON "ask_ai_run"("workspace_id","user_id","created_at");
--> statement-breakpoint
CREATE INDEX "ask_ai_run_recovery_idx" ON "ask_ai_run"("cell_id","status","lease_expires_at");
--> statement-breakpoint
CREATE TABLE "ask_ai_run_event" (
 "run_id" text NOT NULL REFERENCES "ask_ai_run"("id") ON DELETE CASCADE,
 "seq" integer NOT NULL,
 "event" jsonb NOT NULL,
 "created_at" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY ("run_id","seq")
);
--> statement-breakpoint
CREATE TABLE "ask_ai_run_input" (
 "run_id" text PRIMARY KEY NOT NULL REFERENCES "ask_ai_run"("id") ON DELETE CASCADE,
 "sealed" text NOT NULL,
 "expires_at" timestamptz NOT NULL
);
