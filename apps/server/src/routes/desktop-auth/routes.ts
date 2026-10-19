import { Hono, type Context } from "hono";
import {
  exchangeDesktopToken,
  issueDesktopAuthorizationCode,
} from "../../services/desktop-auth/sessions";
import {
  desktopPageCsp,
  escapeHtml,
  pageShell,
  renderConnectedPage,
  renderContinuePage,
  renderErrorPage,
} from "./pages/authorization-pages";

import { createAuth } from "../../services/auth/auth";
import {
  buildDesktopCallbackUrl,
  createDesktopConsentToken,
  DESKTOP_AUTH_REQUEST_MAX_BYTES,
  DesktopAuthorizationError,
  parseDesktopAuthorizationRequest,
  parseDesktopTokenRequest,
  verifyDesktopConsentToken,
  type DesktopAuthorizationRequest,
} from "../../services/desktop-auth/authorization";
import { getZilobaseDiscoveryDocument } from "../../services/instance/discovery/discovery";
import {
  getCanonicalApiOrigin,
  getCanonicalWebOrigin,
  getRequiredStringEnv,
  resolvePublicRequestUrl,
} from "../../shared/config/config";
import type { AppBindings } from "../../shared/contracts/http";

export const desktopAuthRoutes = new Hono<AppBindings>();

desktopAuthRoutes.get("/desktop", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Content-Security-Policy", desktopPageCsp());
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");

  const discovery = await getZilobaseDiscoveryDocument(c.env);
  const connectLink = new URL("zilobase://connect");
  connectLink.searchParams.set("server", discovery.apiOrigin);

  return c.html(
    pageShell(
      `Connect to ${discovery.displayName}`,
      `<p>Use this server with the same Zilobase Desktop app used for Zilobase Cloud.</p><a class="button" href="${escapeHtml(connectLink.toString())}">Open in Zilobase Desktop</a><label class="server-label" for="server-url">Server URL</label><input id="server-url" readonly value="${escapeHtml(discovery.apiOrigin)}"><p class="hint">Copy this URL into <strong>Change server</strong> in the desktop app if the button does not open.</p>`,
    ),
  );
});

desktopAuthRoutes.get("/desktop/connected", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Content-Security-Policy", desktopPageCsp());
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");

  const discovery = await getZilobaseDiscoveryDocument(c.env);
  const openLink = new URL("zilobase://open");
  openLink.searchParams.set("instance", discovery.instanceId);
  openLink.searchParams.set("path", "/recents");
  openLink.searchParams.set("server", discovery.apiOrigin);
  const user = c.get("user");

  return c.html(
    renderConnectedPage(openLink.toString(), user ? { email: user.email, name: user.name } : null),
  );
});

desktopAuthRoutes.get("/desktop/authorize", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Content-Security-Policy", desktopPageCsp());
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");

  let authorizationRequest: DesktopAuthorizationRequest;

  try {
    authorizationRequest = parseDesktopAuthorizationRequest(new URL(c.req.url).searchParams);
  } catch (error) {
    return renderAuthorizationError(c, error);
  }

  c.header(
    "Content-Security-Policy",
    desktopPageCsp(new URL(authorizationRequest.redirectUri).origin),
  );

  const user = c.get("user");

  if (!user) {
    return c.redirect(
      buildDesktopAuthorizeLoginUrl(authorizationRequest, c.req.raw, c.env).toString(),
      303,
    );
  }

  return c.html(
    renderContinuePage(
      authorizationRequest,
      {
        email: user.email,
        name: user.name,
      },
      createDesktopConsentToken(
        authorizationRequest,
        user.id,
        getRequiredStringEnv(c.env, "BETTER_AUTH_SECRET"),
      ),
    ),
  );
});

desktopAuthRoutes.post("/desktop/authorize/consent", async (c) => {
  c.header("Cache-Control", "no-store");

  if (!isAllowedConsentOrigin(c.req.raw, c.env)) {
    return c.json({ error: "invalid_request" }, 403);
  }

  const user = c.get("user");

  if (!user) {
    return c.json({ error: "authentication_required" }, 401);
  }

  const body = await readBoundedBody(c.req.raw);

  if (!body) {
    return c.json({ error: "invalid_request" }, 400);
  }

  let authorizationRequest: DesktopAuthorizationRequest;

  try {
    authorizationRequest = parseDesktopAuthorizationRequest(new URLSearchParams(body));
  } catch (error) {
    return renderAuthorizationError(c, error);
  }

  if (
    !verifyDesktopConsentToken(
      body.get("consent_token") ?? undefined,
      authorizationRequest,
      user.id,
      getRequiredStringEnv(c.env, "BETTER_AUTH_SECRET"),
    )
  ) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const issuer = getCanonicalApiOrigin(c.env);

  if (body.get("decision") !== "allow") {
    return c.redirect(
      buildDesktopCallbackUrl(authorizationRequest, issuer, {
        error: "access_denied",
      }),
      303,
    );
  }

  const code = await issueDesktopAuthorizationCode(
    authorizationRequest,
    user.id,
    c.get("session")?.activeWorkspaceId ?? null,
  );

  return c.redirect(buildDesktopCallbackUrl(authorizationRequest, issuer, { code }), 303);
});

desktopAuthRoutes.post("/desktop/authorize/switch", async (c) => {
  c.header("Cache-Control", "no-store");

  if (!isAllowedConsentOrigin(c.req.raw, c.env)) {
    return c.json({ error: "invalid_request" }, 403);
  }

  const body = await readBoundedBody(c.req.raw);

  if (!body) {
    return c.json({ error: "invalid_request" }, 400);
  }

  let authorizationRequest: DesktopAuthorizationRequest;

  try {
    authorizationRequest = parseDesktopAuthorizationRequest(body);
  } catch (error) {
    return renderAuthorizationError(c, error);
  }

  const loginUrl = buildDesktopAuthorizeLoginUrl(authorizationRequest, c.req.raw, c.env);
  const user = c.get("user");

  if (!user) {
    return c.redirect(loginUrl.toString(), 303);
  }

  if (
    !verifyDesktopConsentToken(
      body.get("consent_token") ?? undefined,
      authorizationRequest,
      user.id,
      getRequiredStringEnv(c.env, "BETTER_AUTH_SECRET"),
    )
  ) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const auth = await createAuth(c.env, c.req.raw, undefined, {
    editionExtension: c.get("editionExtension") ?? undefined,
    policy: c.get("appPolicy"),
  });
  const signOut = await auth.api.signOut({
    asResponse: true,
    headers: c.req.raw.headers,
  });
  const headers = new Headers();
  headers.set("Location", loginUrl.toString());
  copySetCookieHeaders(signOut.headers, headers);
  return new Response(null, { headers, status: 303 });
});

desktopAuthRoutes.post("/api/auth/desktop/token", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");

  const rawBody = await readBoundedBody(c.req.raw);

  if (!rawBody) {
    return tokenError(c, "invalid_request", 400);
  }

  let tokenRequest;

  try {
    tokenRequest = parseDesktopTokenRequest(rawBody);
  } catch (error) {
    return tokenError(
      c,
      error instanceof DesktopAuthorizationError ? error.code : "invalid_request",
      400,
    );
  }

  const token = await exchangeDesktopToken(tokenRequest, c.env, c.req.raw, {
    editionExtension: c.get("editionExtension") ?? undefined,
    policy: c.get("appPolicy"),
  });
  return token ? c.json(token) : tokenError(c, "invalid_grant", 400);
});

function renderAuthorizationError(c: Context<AppBindings>, error: unknown) {
  const authorizationError =
    error instanceof DesktopAuthorizationError
      ? error
      : new DesktopAuthorizationError(
          "invalid_request",
          "The desktop authorization request is invalid.",
        );

  return c.html(renderErrorPage(authorizationError.message), 400);
}

async function readBoundedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (
    !Number.isFinite(contentLength) ||
    contentLength < 0 ||
    contentLength > DESKTOP_AUTH_REQUEST_MAX_BYTES
  ) {
    return null;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return null;
  }

  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > DESKTOP_AUTH_REQUEST_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return null;
  }
}

function isAllowedConsentOrigin(request: Request, env: Record<string, unknown>) {
  const origin = request.headers.get("origin");

  return origin === null || origin === "null" || origin === getCanonicalApiOrigin(env);
}

function tokenError(c: Context<AppBindings>, error: string, status: 400) {
  return c.json({ error }, status);
}

function copySetCookieHeaders(from: Headers, to: Headers) {
  const cookies = typeof from.getSetCookie === "function" ? from.getSetCookie() : [];

  if (cookies.length > 0) {
    for (const cookie of cookies) {
      to.append("Set-Cookie", cookie);
    }
    return;
  }

  const combined = from.get("set-cookie");
  if (combined) {
    to.append("Set-Cookie", combined);
  }
}

function buildDesktopAuthorizeLoginUrl(
  request: DesktopAuthorizationRequest,
  incoming: Request,
  env: Record<string, unknown>,
) {
  const authorizeUrl = resolvePublicRequestUrl(incoming, env);
  authorizeUrl.pathname = "/desktop/authorize";
  authorizeUrl.search = new URLSearchParams({
    client_id: request.clientId,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: request.redirectUri,
    response_type: "code",
    state: request.state,
  }).toString();

  const loginUrl = new URL("/login", getCanonicalWebOrigin(env));
  loginUrl.searchParams.set("returnTo", authorizeUrl.toString());
  return loginUrl;
}
