import { addLoopbackOriginAliases } from "@zilobase/features/auth";
import { requestGoogleAuthorization } from "@zilobase/features/oauth";
import {
  getAuthReturnPath as resolveAuthReturnPath,
  getInvitationAuthSearch as resolveInvitationAuthSearch,
} from "@zilobase/features/auth";
import { apiFetch } from "@/platform/network/api";
import { readOAuthQuery } from "@zilobase/features/oauth";

const CLOUD_API_URL = "https://api.zilobase.com";

export async function signInWithGoogle(callbackURL: string, invitationId?: string | null) {
  const response = await requestGoogleAuthorization(apiFetch, {
    callbackURL: new URL(callbackURL, window.location.origin).toString(),
    errorCallbackURL: new URL(
      `${window.location.pathname}${window.location.search}`,
      window.location.origin,
    ).toString(),
    invitationId,
    oauthQuery: readOAuthQuery(window.location.search),
  });
  window.location.assign(response.url);
  return "web" as const;
}

export function getAuthReturnPath(fallback: string, search = window.location.search) {
  const origin =
    typeof window === "undefined" ? "https://app.zilobase.com" : window.location.origin;
  return resolveAuthReturnPath(fallback, search, origin, allowedBrowserAuthorizationOrigins());
}

export function getInvitationAuthSearch(search = window.location.search) {
  return resolveInvitationAuthSearch(
    search,
    window.location.origin,
    allowedBrowserAuthorizationOrigins(),
  );
}

function allowedBrowserAuthorizationOrigins() {
  const currentOrigin =
    typeof window === "undefined" ? "https://app.zilobase.com" : window.location.origin;
  const origins = new Set([currentOrigin, CLOUD_API_URL]);
  const configured = import.meta.env.VITE_API_URL;

  if (configured) {
    try {
      addLoopbackOriginAliases(origins, new URL(configured, currentOrigin).origin);
    } catch {
      // Invalid build-time values are ignored instead of creating an open redirect.
    }
  }

  return origins;
}
