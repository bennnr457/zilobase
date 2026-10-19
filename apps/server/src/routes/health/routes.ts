import { Hono } from "hono";
import { readBackgroundHealth } from "../../services/health/background";
import { checkReadiness } from "../../services/health/readiness";
import { getStringEnv } from "../../shared/config/config";
import type { AppBindings } from "../../shared/contracts/http";

export const healthRoutes = new Hono<AppBindings>();

healthRoutes.get("/", (c) => {
  return c.json({ ok: true, service: "zilobase-server" });
});

healthRoutes.get("/health", (c) => {
  return c.json({ ok: true, service: "zilobase-server" });
});

healthRoutes.get("/health/background", async (c) => {
  const expected = getStringEnv(c.env ?? {}, "ZILOBASE_OPERATIONS_TOKEN");
  const supplied = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || !(await equalSecret(expected, supplied)))
    return c.json({ error: "Not found" }, 404);
  const snapshot = await readBackgroundHealth(c.env ?? {});
  if (!snapshot.healthy) {
    c.header("Retry-After", "30");
    return c.json(snapshot, 503);
  }
  return c.json(snapshot);
});

healthRoutes.get("/ready", async (c) => {
  const result = await checkReadiness(c.env);

  if (result.ok) {
    return c.json(result);
  }

  console.warn(
    JSON.stringify({
      checks: result.checks,
      event: "readiness_check_failed",
      requestId: c.get("requestId"),
    }),
  );
  c.header("Retry-After", "5");
  return c.json(result, 503);
});

async function equalSecret(expected: string, supplied: string) {
  const [left, right] = await Promise.all(
    [expected, supplied].map(
      async (value) =>
        new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    ),
  );
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index]! ^ right[index]!;
  return mismatch === 0;
}
