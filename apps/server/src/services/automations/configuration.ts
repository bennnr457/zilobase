import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";
export function isAutomationWebhooksEnabled(env: RuntimeEnv) {
  return getStringEnv(env, "AUTOMATION_WEBHOOKS_ENABLED")?.trim().toLowerCase() === "true";
}

export function isAutomationSlackEnabled(env: RuntimeEnv) {
  return getStringEnv(env, "AUTOMATION_SLACK_ENABLED")?.trim().toLowerCase() === "true";
}

export function getAutomationWebhookHttpDomains(env: RuntimeEnv) {
  return new Set(
    (getStringEnv(env, "AUTOMATION_WEBHOOK_HTTP_DOMAINS") ?? "")
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isDatabaseAutomationsFeatureEnabled(env: RuntimeEnv) {
  return getStringEnv(env, "DATABASE_AUTOMATIONS_ENABLED")?.trim().toLowerCase() === "true";
}

export function isDatabaseAutomationExecutionEnabled(env: RuntimeEnv) {
  return (
    getStringEnv(env, "DATABASE_AUTOMATIONS_EXECUTION_DISABLED")?.trim().toLowerCase() !== "true"
  );
}

export function getDatabaseAutomationRetention(env: RuntimeEnv) {
  return {
    runSummaryDays: boundedPositiveInteger(
      env,
      "DATABASE_AUTOMATION_RUN_RETENTION_DAYS",
      30,
      1,
      365,
    ),
    stepDetailDays: boundedPositiveInteger(
      env,
      "DATABASE_AUTOMATION_STEP_RETENTION_DAYS",
      7,
      1,
      90,
    ),
  };
}

function boundedPositiveInteger(
  env: RuntimeEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(getStringEnv(env, key));
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(parsed, maximum)) : fallback;
}
