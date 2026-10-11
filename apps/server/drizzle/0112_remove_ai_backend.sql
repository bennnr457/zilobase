DELETE FROM "background_dispatch" WHERE "kind" = 'ai.job';
--> statement-breakpoint
DELETE FROM "background_maintenance_task" WHERE "task_key" = 'ai.cleanup';
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_mcp_materialization_reservation";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_mcp_dataset_chunk";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_mcp_dataset";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_mcp_materialization";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_mcp_activity";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_mcp_tool_snapshot";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_mcp_oauth_attempt";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_mcp_client_registration";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_mcp_credential";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_mcp_connection";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_mcp_approved_server";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_workspace_mcp_policy";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_chat_artifact";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_chat_upload";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_action_receipt";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_tool_execution";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_pending_action";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_agent_turn";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_chat_feedback";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_chat_thread_summary";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_chat_message";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_chat_thread";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_settings_draft";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_settings_version";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_settings";
--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_ai_provider_config";
--> statement-breakpoint
DROP TABLE IF EXISTS "ai_job";
