import { eq } from "drizzle-orm";
import { db, runWithDbEnv } from "../../../infrastructure/database";
import { user } from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import {
  getCanonicalApiOrigin,
  getPrimaryClientOrigin,
  isLocalDevelopmentHost,
  resolvePublicRequestUrl,
} from "../../../shared/config/config";
import type { EditionExtensionOptions } from "../../../shared/contracts/edition";
import type { AppBindings } from "../../../shared/contracts/http";
import { getMembership } from "../../access/principal-access";
import { readApiKeyFromHeaders, readApiKeyWorkspaceId } from "../../api-keys/api-keys";
import { DEMO_IDS } from "../../demo/constants";
import { expireTemporaryMemberships } from "../../memberships/temporary-membership";
import { createAuth } from "../auth";
import { isLikelyJwt, readBearerToken, resolveOAuthBearer } from "../oauth/access-tokens";
import { ensureOfficialClipperClient } from "../oauth/oauth-clients";
import { getAuthHeaders } from "./headers";

export function withAuthDatabase<T>(
  env: RuntimeEnv,
  run: () => Promise<T>,
  options?: Parameters<typeof runWithDbEnv>[2],
) {
  return runWithDbEnv(env, run, options);
}
export function findSessionUsers(userId: string) {
  return db.select().from(user).where(eq(user.id, userId)).limit(1);
}
export function createRequestAuth(
  env: RuntimeEnv,
  request: Request,
  options: EditionExtensionOptions,
) {
  return createAuth(env, request, db, options);
}
export function expireSessionMemberships(userId: string) {
  return expireTemporaryMemberships(db, { userId });
}
export function assertEditionSession(
  input: Omit<
    Parameters<
      NonNullable<NonNullable<EditionExtensionOptions["editionExtension"]>["assertSession"]>
    >[0],
    "database"
  >,
  extension: EditionExtensionOptions["editionExtension"],
) {
  return extension?.assertSession?.({ ...input, database: db }) ?? Promise.resolve();
}

export async function ensureRequestClipperClient(env: RuntimeEnv) {
  await ensureOfficialClipperClient(db, getPrimaryClientOrigin(env));
}

function normalizeAuthSession<TSession extends Record<string, unknown>>(
  session: TSession | null | undefined,
) {
  if (!session) {
    return null;
  }

  const activeWorkspaceId =
    typeof session.activeWorkspaceId === "string"
      ? session.activeWorkspaceId
      : typeof session.activeOrganizationId === "string"
        ? session.activeOrganizationId
        : null;

  return {
    ...session,
    activeWorkspaceId,
  };
}

type ResolvedSession = Pick<
  AppBindings["Variables"],
  "apiKey" | "authMethod" | "oauthScopes" | "user" | "session"
>;
type SessionDenial = { denial: { body: Record<string, unknown>; status: 401 | 403 | 503 } };
type MeasureSession = <T>(name: string, run: () => Promise<T>) => Promise<T>;
export async function resolveRequestSession(
  env: RuntimeEnv,
  request: Request,
  options: EditionExtensionOptions,
  demoRequest: boolean,
  measure: MeasureSession,
): Promise<ResolvedSession | SessionDenial> {
  const editionExtension = options.editionExtension;
  const policy = options.policy!;
  const state: ResolvedSession = {
    apiKey: null,
    authMethod: null,
    oauthScopes: null,
    user: null,
    session: null,
  };
  state.apiKey = null;
  state.authMethod = null;
  state.oauthScopes = null;

  if (demoRequest) {
    const [demoUser] = await findSessionUsers(DEMO_IDS.user);

    if (!demoUser || !(await getMembership(DEMO_IDS.workspace, DEMO_IDS.user))) {
      return {
        denial: {
          body: {
            code: "DEMO_UNAVAILABLE",
            error: "The hosted demo is unavailable.",
          },
          status: 503,
        },
      };
    }

    const now = new Date();
    state.user = demoUser;
    state.session = {
      activeTeamId: null,
      activeWorkspaceId: DEMO_IDS.workspace,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      id: "demo:synthetic-session",
      ipAddress: null,
      token: "",
      updatedAt: now,
      userAgent: null,
      userId: demoUser.id,
    };
    state.authMethod = "demo";
    return state;
  }

  const rawApiKey = readApiKeyFromHeaders(request.headers);
  if (rawApiKey) {
    const auth = await createRequestAuth(env, request, {
      editionExtension: editionExtension ?? undefined,
      policy: policy,
    });
    const verification = await measure("session_api_key_verify", () =>
      auth.api.verifyApiKey({
        body: { key: rawApiKey },
      }),
    );

    if (!verification.valid || !verification.key) {
      return { denial: { body: { error: "Unauthorized" }, status: 401 } };
    }

    const verifiedKey = verification.key;
    const workspaceId = readApiKeyWorkspaceId(verifiedKey.metadata);

    if (!workspaceId) {
      return { denial: { body: { error: "API key is missing workspace metadata" }, status: 401 } };
    }

    const requestedWorkspaceId = request.headers.get("x-zilobase-workspace-id")?.trim();

    if (requestedWorkspaceId && requestedWorkspaceId !== workspaceId) {
      return {
        denial: {
          body: {
            error: "Forbidden",
            message: "API keys can only access the workspace they were created for.",
          },
          status: 403,
        },
      };
    }

    const [apiKeyUser] = await measure("session_api_key_user", () =>
      findSessionUsers(verifiedKey.referenceId),
    );

    if (!apiKeyUser) {
      return { denial: { body: { error: "Unauthorized" }, status: 401 } };
    }

    if (
      !(await measure("session_api_key_membership", () =>
        getMembership(workspaceId, apiKeyUser.id),
      ))
    ) {
      return { denial: { body: { error: "Forbidden" }, status: 403 } };
    }

    state.user = apiKeyUser;
    state.session = {
      activeWorkspaceId: workspaceId,
      activeTeamId: null,
      createdAt: verifiedKey.createdAt,
      expiresAt: verifiedKey.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 100),
      id: `api-key:${verifiedKey.id}`,
      ipAddress: null,
      token: "",
      updatedAt: verifiedKey.updatedAt,
      userId: apiKeyUser.id,
      userAgent: null,
    };
    state.apiKey = {
      id: verifiedKey.id,
      workspaceId,
      referenceId: verifiedKey.referenceId,
    };
    state.authMethod = "apiKey";

    return state;
  }

  const bearerToken = readBearerToken(request.headers.get("authorization"));
  if (bearerToken && isLikelyJwt(bearerToken)) {
    const requestUrl = resolvePublicRequestUrl(request, env);
    const apiOrigin = isLocalDevelopmentHost(requestUrl.hostname)
      ? requestUrl.origin
      : getCanonicalApiOrigin(env);
    const oauthAccess = await measure("session_oauth_verify", () =>
      resolveOAuthBearer({
        apiOrigin,
        requestedWorkspaceId: request.headers.get("x-zilobase-workspace-id")?.trim() || null,
        token: bearerToken,
      }),
    );

    if ("status" in oauthAccess) {
      return { denial: { body: oauthAccess.body, status: oauthAccess.status } };
    }

    const now = new Date();
    state.user = oauthAccess.user;
    state.session = {
      activeTeamId: null,
      activeWorkspaceId: oauthAccess.workspaceId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      id: oauthAccess.sessionId ?? `oauth:${oauthAccess.user.id}`,
      ipAddress: null,
      token: "",
      updatedAt: now,
      userAgent: null,
      userId: oauthAccess.user.id,
    };
    state.authMethod = "oauth";
    state.oauthScopes = oauthAccess.scopes;
    return state;
  }

  const auth = await createRequestAuth(env, request, {
    editionExtension: editionExtension ?? undefined,
    policy: policy,
  });
  const session = await measure("session_auth", async () =>
    auth.api.getSession({
      headers: await getAuthHeaders(auth, request.headers),
    }),
  );

  if (session?.user) {
    await measure("session_expire_temporary_memberships", () =>
      expireSessionMemberships(session.user.id),
    );
  }

  state.user = session?.user ?? null;
  const normalizedSession = normalizeAuthSession(session?.session);
  const activeMembership =
    session?.user && normalizedSession?.activeWorkspaceId
      ? await getMembership(normalizedSession.activeWorkspaceId, session.user.id)
      : null;
  state.session =
    normalizedSession && normalizedSession.activeWorkspaceId && !activeMembership
      ? { ...normalizedSession, activeTeamId: null, activeWorkspaceId: null }
      : normalizedSession;
  state.authMethod = session?.user ? "session" : null;

  const effectiveSession = state.session;
  if (session?.user && effectiveSession) {
    const denial = await measure("session_edition_policy", () =>
      assertEditionSession(
        {
          authMethod: "session",
          request: request,
          session: effectiveSession,
          user: session.user,
        },
        editionExtension ?? undefined,
      ),
    );

    if (denial) {
      return {
        denial: { body: { code: denial.code, message: denial.message }, status: denial.status },
      };
    }
  }

  return state;
}
