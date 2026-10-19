import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import type { AppBindings } from "../../../shared/contracts/http";

export function requireOAuthScope(c: Context<AppBindings>, scope: string) {
  if (c.get("authMethod") !== "oauth") {
    return null;
  }

  const scopes = c.get("oauthScopes") ?? [];

  if (scopes.includes(scope)) {
    return null;
  }

  c.header("WWW-Authenticate", `Bearer error="insufficient_scope", scope="${scope}"`);
  return c.json(
    {
      error: "insufficient_scope",
      error_description: `Missing required scope: ${scope}`,
    },
    403,
  );
}

// Only APIs with explicit OAuth scope and workspace checks accept delegated tokens.
export function rejectUnsupportedOAuthRoute(c: Context<AppBindings>) {
  if (c.get("authMethod") !== "oauth") return null;
  const path = c.req.path.replace(/\/$/, "");
  if (
    /^\/(pages|databases)(\/|$)/.test(path) ||
    path === "/clips" ||
    path === "/clips/duplicates" ||
    path === "/search" ||
    /^\/workspaces(?:\/[^/]+)?$/.test(path)
  )
    return null;
  return c.json(
    { error: "insufficient_scope", error_description: "This API does not accept OAuth tokens." },
    403,
  );
}

export function oauthScopeMiddleware(scopeFor: (c: Context<AppBindings>) => string) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const denied = requireOAuthScope(c, scopeFor(c));
    if (denied) {
      return denied;
    }

    await next();
  });
}

export function scopeForReadWrite(readScope: string, writeScope: string) {
  return (c: Context<AppBindings>) =>
    c.req.method === "GET" || c.req.method === "HEAD" ? readScope : writeScope;
}

export function getPinnedWorkspaceId(c: Context<AppBindings>) {
  if (c.get("authMethod") === "apiKey") {
    return c.get("apiKey")?.workspaceId ?? null;
  }

  if (c.get("authMethod") === "oauth") {
    return c.get("session")?.activeWorkspaceId ?? null;
  }

  return null;
}

export function rejectMismatchedPinnedWorkspace(
  c: Context<AppBindings>,
  workspaceId: string | null | undefined,
) {
  const pinnedWorkspaceId = getPinnedWorkspaceId(c);

  if (!pinnedWorkspaceId || !workspaceId || workspaceId === pinnedWorkspaceId) {
    return null;
  }

  return c.json(
    {
      error: "Forbidden",
      message:
        c.get("authMethod") === "oauth"
          ? "OAuth tokens can only access the workspace they were issued for."
          : "API keys can only access the workspace they were created for.",
    },
    403,
  );
}
