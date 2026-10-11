DELETE FROM "background_dispatch" WHERE "kind" = 'agent.run';
--> statement-breakpoint
DELETE FROM "background_maintenance_task" WHERE "task_key" = 'agent.schedules';
--> statement-breakpoint
DELETE FROM "page_access" WHERE "target_type" = 'agent';
--> statement-breakpoint
DELETE FROM "database_access" WHERE "target_type" = 'agent';
--> statement-breakpoint
DELETE FROM "item_visit" WHERE "item_kind" = 'agent';
--> statement-breakpoint
DELETE FROM "ai_settings" WHERE "scope" NOT LIKE 'personal:%';
--> statement-breakpoint
UPDATE "ai_settings"
SET "definition" = "definition" - 'triggers' - 'resources' - 'grants' - 'instructionResources';
--> statement-breakpoint
UPDATE "ai_settings_draft"
SET
  "definition" = "definition" - 'triggers' - 'resources' - 'grants' - 'instructionResources',
  "review" = CASE
    WHEN "review" IS NULL THEN NULL
    ELSE jsonb_set(
      jsonb_set(
        jsonb_set(
          "review",
          '{before}',
          COALESCE("review"->'before', '{}'::jsonb) - 'triggers' - 'resources' - 'grants' - 'instructionResources'
        ),
        '{after}',
        COALESCE("review"->'after', '{}'::jsonb) - 'triggers' - 'resources' - 'grants' - 'instructionResources'
      ),
      '{fields}',
      COALESCE(
        (
          SELECT jsonb_agg(to_jsonb(field))
          FROM jsonb_array_elements_text(COALESCE("review"->'fields', '[]'::jsonb)) AS field
          WHERE field NOT IN ('triggers', 'resources', 'grants', 'instructionResources')
        ),
        '[]'::jsonb
      )
    )
  END;
--> statement-breakpoint
UPDATE "ai_settings_version"
SET "definition" = "definition" - 'triggers' - 'resources' - 'grants' - 'instructionResources';
--> statement-breakpoint
DELETE FROM "ai_mcp_materialization"
WHERE "scope_type" <> 'personal'
   OR "agent_profile_id" IS NOT NULL
   OR "agent_run_id" IS NOT NULL
   OR "thread_id" IS NULL
   OR "scope_user_id" IS NULL;
--> statement-breakpoint
DELETE FROM "ai_mcp_connection"
WHERE "scope_type" <> 'personal'
   OR "agent_profile_id" IS NOT NULL
   OR "scope_user_id" IS NULL;
--> statement-breakpoint
DELETE FROM "ai_mcp_dataset"
WHERE "scope_type" <> 'personal'
   OR "agent_profile_id" IS NOT NULL
   OR "agent_run_id" IS NOT NULL
   OR "thread_id" IS NULL
   OR "scope_user_id" IS NULL;
--> statement-breakpoint
DELETE FROM "ai_mcp_activity"
WHERE "scope_type" <> 'personal'
   OR "agent_profile_id" IS NOT NULL
   OR "scope_user_id" IS NULL;
--> statement-breakpoint
DELETE FROM "ai_agent_tool_execution"
WHERE "agent_run_id" IS NOT NULL OR "turn_id" IS NULL;
--> statement-breakpoint
DELETE FROM "ai_agent_pending_action"
WHERE "agent_run_id" IS NOT NULL
   OR "thread_id" IS NULL
   OR "mcp_scope_type" = 'agent';
--> statement-breakpoint
ALTER TABLE "ai_agent_turn" DROP COLUMN "agent_profile_id";
--> statement-breakpoint
DROP INDEX "ai_agent_tool_execution_run_call_unique";
--> statement-breakpoint
DROP INDEX "ai_agent_tool_execution_run_created_idx";
--> statement-breakpoint
ALTER TABLE "ai_agent_tool_execution" DROP CONSTRAINT "ai_agent_tool_execution_context_check";
--> statement-breakpoint
ALTER TABLE "ai_agent_tool_execution" DROP COLUMN "agent_run_id";
--> statement-breakpoint
ALTER TABLE "ai_agent_tool_execution" ALTER COLUMN "turn_id" SET NOT NULL;
--> statement-breakpoint
DROP INDEX "ai_agent_tool_execution_turn_call_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_tool_execution_turn_call_unique"
  ON "ai_agent_tool_execution" ("turn_id", "tool_call_id");
--> statement-breakpoint
ALTER TABLE "ai_agent_tool_execution" ADD CONSTRAINT "ai_agent_tool_execution_context_check"
  CHECK ("turn_id" IS NOT NULL);
--> statement-breakpoint
DROP INDEX "ai_agent_pending_action_run_call_unique";
--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" DROP CONSTRAINT "ai_agent_pending_action_context_check";
--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" DROP CONSTRAINT "ai_agent_pending_action_mcp_scope_check";
--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" DROP COLUMN "agent_run_id";
--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" DROP COLUMN "agent_profile_id";
--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" ALTER COLUMN "thread_id" SET NOT NULL;
--> statement-breakpoint
DROP INDEX "ai_agent_pending_action_thread_call_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_pending_action_thread_call_unique"
  ON "ai_agent_pending_action" ("thread_id", "tool_call_id");
--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" ADD CONSTRAINT "ai_agent_pending_action_context_check"
  CHECK ("thread_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" ADD CONSTRAINT "ai_agent_pending_action_mcp_scope_check"
  CHECK (
    "connection_id" IS NULL
    OR ("mcp_scope_type" = 'personal' AND "mcp_scope_user_id" IS NOT NULL)
  );
--> statement-breakpoint
DROP INDEX "ai_mcp_connection_profile_endpoint_unique";
--> statement-breakpoint
DROP INDEX "ai_mcp_connection_profile_state_idx";
--> statement-breakpoint
ALTER TABLE "ai_mcp_connection" DROP CONSTRAINT "ai_mcp_connection_scope_check";
--> statement-breakpoint
ALTER TABLE "ai_mcp_connection" DROP COLUMN "agent_profile_id";
--> statement-breakpoint
ALTER TABLE "ai_mcp_connection" ALTER COLUMN "scope_type" SET DEFAULT 'personal';
--> statement-breakpoint
ALTER TABLE "ai_mcp_connection" ALTER COLUMN "scope_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_mcp_connection" ADD CONSTRAINT "ai_mcp_connection_scope_check"
  CHECK (
    "scope_type" = 'personal'
    AND "scope_user_id" IS NOT NULL
    AND "authenticated_by_user_id" = "scope_user_id"
  );
--> statement-breakpoint
DROP INDEX "ai_mcp_activity_profile_created_idx";
--> statement-breakpoint
ALTER TABLE "ai_mcp_activity" DROP CONSTRAINT "ai_mcp_activity_scope_check";
--> statement-breakpoint
ALTER TABLE "ai_mcp_activity" DROP COLUMN "agent_profile_id";
--> statement-breakpoint
ALTER TABLE "ai_mcp_activity" ALTER COLUMN "scope_type" SET DEFAULT 'personal';
--> statement-breakpoint
ALTER TABLE "ai_mcp_activity" ALTER COLUMN "scope_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_mcp_activity" ADD CONSTRAINT "ai_mcp_activity_scope_check"
  CHECK ("scope_type" = 'personal' AND "scope_user_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" DROP CONSTRAINT "ai_mcp_dataset_scope_check";
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" DROP CONSTRAINT "ai_mcp_dataset_context_check";
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" DROP COLUMN "agent_profile_id";
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" DROP COLUMN "agent_run_id";
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" ALTER COLUMN "scope_type" SET DEFAULT 'personal';
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" ALTER COLUMN "scope_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" ALTER COLUMN "thread_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" ADD CONSTRAINT "ai_mcp_dataset_scope_check"
  CHECK ("scope_type" = 'personal' AND "scope_user_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" ADD CONSTRAINT "ai_mcp_dataset_context_check"
  CHECK ("thread_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" DROP CONSTRAINT "ai_mcp_materialization_scope_check";
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" DROP CONSTRAINT "ai_mcp_materialization_context_check";
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" DROP COLUMN "agent_profile_id";
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" DROP COLUMN "agent_run_id";
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" ALTER COLUMN "scope_type" SET DEFAULT 'personal';
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" ALTER COLUMN "scope_user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" ALTER COLUMN "thread_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" ADD CONSTRAINT "ai_mcp_materialization_scope_check"
  CHECK ("scope_type" = 'personal' AND "scope_user_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" ADD CONSTRAINT "ai_mcp_materialization_context_check"
  CHECK ("thread_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "ai_agent_profile" DROP CONSTRAINT IF EXISTS "ai_agent_profile_current_revision_fk";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_conversation_message";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_run_event";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_event_receipt";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_run";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_trigger";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_conversation";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_revision";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_profile_access";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_profile";
