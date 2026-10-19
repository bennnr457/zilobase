import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import {
  resolveRequestSession,
  withAuthDatabase,
} from "../../../services/auth/sessions/session-resolution";
import type { AppBindings } from "../../../shared/contracts/http";
import { isHostedDemoRequest } from "../../demo/request";
import { rejectUnsupportedOAuthRoute } from "../oauth/oauth-access";

export const sessionMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  return await timed(c, "session_db", () =>
    withAuthDatabase(
      c.env,
      async () => {
        const result = await resolveRequestSession(
          c.env,
          c.req.raw,
          {
            editionExtension: c.get("editionExtension") ?? undefined,
            policy: c.get("appPolicy"),
          },
          isHostedDemoRequest(c.env, c.req.raw.headers),
          (name, run) => timed(c, name, run),
        );
        if ("denial" in result) return c.json(result.denial.body, result.denial.status);
        c.set("apiKey", result.apiKey);
        c.set("authMethod", result.authMethod);
        c.set("oauthScopes", result.oauthScopes);
        c.set("user", result.user);
        c.set("session", result.session);
        const unsupported = rejectUnsupportedOAuthRoute(c);
        if (unsupported) return unsupported;
        await timed(c, "session_next", next);
      },
      {
        onTiming(name, durationMs) {
          const timings = c.get("serverTimings") ?? [];
          if (!c.get("serverTimings")) c.set("serverTimings", timings);
          timings.push(`zilobase_${name};dur=${durationMs}`);
        },
      },
    ),
  );
});

async function timed<T>(
  c: Parameters<MiddlewareHandler<AppBindings>>[0],
  name: string,
  run: () => Promise<T>,
) {
  const startedAt = performance.now();

  try {
    return await run();
  } finally {
    const timings = c.get("serverTimings") ?? [];
    if (!c.get("serverTimings")) c.set("serverTimings", timings);
    timings.push(`zilobase_${name};dur=${Math.round(performance.now() - startedAt)}`);
  }
}
