import type { Context } from "hono";
import { getAutomationWebhookHttpDomains } from "../../services/automations/configuration";
import { isCommunityRegistration } from "../../shared/config/app-policy";
import type { AppBindings } from "../../shared/contracts/http";
import { requireDatabaseRouteUser } from "../databases/support";
export function webhookHttpDomains(c: Context<AppBindings>) {
  return isCommunityRegistration(c.get("appPolicy"))
    ? getAutomationWebhookHttpDomains(c.env ?? {})
    : new Set<string>();
}

export async function handle(
  c: Context<AppBindings>,
  callback: () => Promise<Response>,
  callbackReturnsResponse: true,
): Promise<Response>;

export async function handle<T extends object>(
  c: Context<AppBindings>,
  callback: () => Promise<T>,
  callbackReturnsResponse?: false,
): Promise<Response>;

export async function handle(
  c: Context<AppBindings>,
  callback: () => Promise<object | Response>,
  callbackReturnsResponse = false,
): Promise<Response> {
  const result = await callback();
  return callbackReturnsResponse ? (result as Response) : c.json(result);
}

export function invalidBody(
  c: Context<AppBindings>,
  issues: Array<{ message: string; path: PropertyKey[] }>,
) {
  return c.json(
    {
      code: "AUTOMATION_INVALID_REQUEST",
      error: "Request body is invalid",
      validation: {
        errors: issues.map((issue) => ({
          code: "invalid_request",
          message: issue.message,
          path: issue.path.map(String),
        })),
        valid: false,
        warnings: [],
      },
    },
    400,
  );
}

export function requireIdempotencyKey(header: string | undefined, body: string) {
  const value = header?.trim();
  if (!value || value.length > 200) {
    return {
      ok: false as const,
      error: {
        code: "AUTOMATION_IDEMPOTENCY_KEY_REQUIRED",
        error: "A valid Idempotency-Key header is required",
      },
    };
  }
  if (value !== body) {
    return {
      ok: false as const,
      error: {
        code: "AUTOMATION_IDEMPOTENCY_KEY_MISMATCH",
        error: "Idempotency-Key must match body.idempotencyKey",
      },
    };
  }
  return { ok: true as const, value };
}

export function parseIfMatch(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
  return /^\d+$/.test(normalized) && Number(normalized) > 0 ? Number(normalized) : null;
}

export function requireAutomationSource(c: Context<AppBindings>) {
  const user = requireDatabaseRouteUser(c);
  if (!user) return { ok: false as const, response: c.json({ error: "Unauthorized" }, 401) };
  const dataSourceId = c.req.query("dataSourceId")?.trim();
  if (!dataSourceId)
    return {
      ok: false as const,
      response: c.json(
        { code: "AUTOMATION_SOURCE_REQUIRED", error: "dataSourceId is required" },
        400,
      ),
    };
  return { ok: true as const, user, dataSourceId };
}
