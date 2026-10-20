ALTER TABLE "ask_ai_turn" ADD COLUMN "progress" jsonb NOT NULL DEFAULT '{"activities":[],"canContinue":false}'::jsonb;
--> statement-breakpoint
ALTER TABLE "ask_ai_run" ADD COLUMN "agent_version" integer NOT NULL DEFAULT 1;
