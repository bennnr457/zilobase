export const API_KEY_PREFIX = "nl_";
export const API_KEY_DEFAULT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 90;

export type ApiKeyMetadata = {
  workspaceId?: unknown;
};

export function readApiKeyFromHeaders(headers: Headers) {
  const authorization = headers.get("authorization")?.trim();

  if (authorization) {
    const [scheme, ...rest] = authorization.split(/\s+/);
    const token = rest[0];

    if (
      scheme?.toLowerCase() === "bearer" &&
      rest.length === 1 &&
      token?.startsWith(API_KEY_PREFIX)
    ) {
      return token;
    }
  }

  return headers.get("x-api-key")?.trim() || null;
}

export function readApiKeyWorkspaceId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const workspaceId = (metadata as ApiKeyMetadata).workspaceId;

  return typeof workspaceId === "string" && workspaceId.length > 0 ? workspaceId : null;
}
