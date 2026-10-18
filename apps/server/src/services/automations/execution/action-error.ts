import { isDatabaseUnavailableError } from "../../../shared/errors/database-errors";

export function isRetryableAutomationDatabaseError(error: unknown): boolean {
  if (isDatabaseUnavailableError(error)) return true;
  const pending = [error];
  const seen = new Set<unknown>();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const record = current as { code?: unknown; cause?: unknown; errors?: unknown };
    if (record.code === "40001" || record.code === "40P01") return true;
    pending.push(record.cause);
    if (Array.isArray(record.errors)) pending.push(...record.errors);
  }
  return false;
}

export class AutomationActionError extends Error {
  constructor(
    message: string,
    readonly code = "AUTOMATION_ACTION_FAILED",
    readonly actionId: string | null = null,
  ) {
    super(message);
    this.name = "AutomationActionError";
  }
}

export class RetryableAutomationActionError extends AutomationActionError {
  constructor(
    message: string,
    code: string,
    readonly availableAt: Date,
    actionId: string | null = null,
  ) {
    super(message, code, actionId);
    this.name = "RetryableAutomationActionError";
  }
}

export function actionFailure(error: unknown, actionId: string | null = null) {
  if (error instanceof RetryableAutomationActionError) {
    return new RetryableAutomationActionError(
      error.message,
      error.code,
      error.availableAt,
      error.actionId ?? actionId,
    );
  }
  if (error instanceof AutomationActionError) {
    return new AutomationActionError(error.message, error.code, error.actionId ?? actionId);
  }
  return new AutomationActionError(
    error instanceof Error ? error.message.slice(0, 2_000) : "Automation action failed",
    "AUTOMATION_ACTION_FAILED",
    actionId,
  );
}

export function isAutomationLeaseLost(error: unknown) {
  return error instanceof AutomationActionError && error.code === "AUTOMATION_LEASE_LOST";
}
