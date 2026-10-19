import { verifyJwsAccessToken } from "better-auth/oauth2";
import { eq } from "drizzle-orm";
import type { JSONWebKeySet, JWK, JWTPayload } from "jose";
import { db } from "../../../infrastructure/database/index";
import {
  jwks as jwksTable,
  session as sessionTable,
  user as userTable,
} from "../../../infrastructure/database/schema";
import { getMembership } from "../../access/principal-access";
export function isLikelyJwt(token: string) {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function readBearerToken(authorization: string | null | undefined) {
  if (!authorization) {
    return null;
  }

  const [scheme, ...rest] = authorization.trim().split(/\s+/);
  const token = rest[0];

  if (scheme?.toLowerCase() !== "bearer" || rest.length !== 1 || !token) {
    return null;
  }

  return token;
}

export function parseOAuthScopes(scope: unknown) {
  if (typeof scope !== "string" || scope.trim().length === 0) {
    return [];
  }

  return scope.trim().split(/\s+/);
}

export type OAuthAccessSuccess = {
  scopes: string[];
  user: typeof userTable.$inferSelect;
  workspaceId: string;
  sessionId: string | null;
};

export type OAuthAccessFailure = {
  body: { error: string; message?: string };
  status: 401 | 403;
};

export async function resolveOAuthBearer(options: {
  apiOrigin: string;
  requestedWorkspaceId: string | null;
  token: string;
  verify?: typeof verifyJwsAccessToken;
}): Promise<OAuthAccessSuccess | OAuthAccessFailure> {
  const verify = options.verify ?? verifyJwsAccessToken;
  let payload: JWTPayload;

  try {
    payload = await verify(options.token, {
      jwksFetch: loadLocalJwks,
      jwksCacheKey: localJwksCacheKey,
      verifyOptions: {
        audience: options.apiOrigin,
        issuer: options.apiOrigin,
      },
    });
  } catch {
    return { body: { error: "Unauthorized" }, status: 401 };
  }

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const workspaceId = readStringClaim(payload, "workspace_id");
  const sessionId = readStringClaim(payload, "sid");

  if (!userId || !workspaceId) {
    return {
      body: {
        error: "Forbidden",
        message: "OAuth token is missing a user or workspace claim.",
      },
      status: 403,
    };
  }

  if (options.requestedWorkspaceId && options.requestedWorkspaceId !== workspaceId) {
    return {
      body: {
        error: "Forbidden",
        message: "OAuth tokens can only access the workspace they were issued for.",
      },
      status: 403,
    };
  }

  if (sessionId) {
    const [oauthSession] = await db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(eq(sessionTable.id, sessionId))
      .limit(1);

    if (!oauthSession) {
      return { body: { error: "Unauthorized" }, status: 401 };
    }
  }

  const [user] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);

  if (!user) {
    return { body: { error: "Unauthorized" }, status: 401 };
  }

  if (!(await getMembership(workspaceId, user.id))) {
    return { body: { error: "Forbidden" }, status: 403 };
  }

  return {
    scopes: parseOAuthScopes(payload.scope),
    sessionId,
    user,
    workspaceId,
  };
}

export function readStringClaim(payload: JWTPayload, claim: string) {
  const value = payload[claim];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const localJwksCacheKey = {};

export async function loadLocalJwks(): Promise<JSONWebKeySet> {
  const rows = await db
    .select({ id: jwksTable.id, publicKey: jwksTable.publicKey })
    .from(jwksTable);

  return {
    keys: rows.flatMap((row) => {
      try {
        const parsed = JSON.parse(row.publicKey) as JWK;
        return parsed && typeof parsed === "object" ? [{ ...parsed, kid: row.id }] : [];
      } catch {
        return [];
      }
    }),
  };
}
