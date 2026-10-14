import type { ApiFetcher } from "../shared/api-fetcher";
import type {
  OAuthApp,
  OAuthConsent,
  PublicOAuthClient,
  CreateOAuthAppInput,
  OAuthRedirect,
} from "./contracts";
import type { ZilobaseAuthClient } from "../shared/auth-client";

export async function listOAuthApps(apiFetch: ApiFetcher) {
  const result = await apiFetch<OAuthApp[] | { clients?: OAuthApp[] }>(
    "/api/auth/oauth2/get-clients",
    { method: "GET" },
  );
  return Array.isArray(result) ? result : (result.clients ?? []);
}
export async function listOAuthConsents(apiFetch: ApiFetcher) {
  const result = await apiFetch<OAuthConsent[] | { consents?: OAuthConsent[] }>(
    "/api/auth/oauth2/get-consents",
    { method: "GET" },
  );
  return Array.isArray(result) ? result : (result.consents ?? []);
}
export function publicOAuthClient(apiFetch: ApiFetcher, clientId: string) {
  return apiFetch<PublicOAuthClient>(
    `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
    { method: "GET" },
  );
}

export function createOAuthApp(apiFetch: ApiFetcher, input: CreateOAuthAppInput) {
  return apiFetch<OAuthApp>("/api/auth/oauth2/create-client", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function deleteOAuthApp(apiFetch: ApiFetcher, clientId: string) {
  return apiFetch("/api/auth/oauth2/delete-client", {
    method: "POST",
    body: JSON.stringify({ client_id: clientId }),
  });
}
export function revokeOAuthConsent(apiFetch: ApiFetcher, id: string) {
  return apiFetch("/api/auth/oauth2/delete-consent", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}
export async function submitOAuthConsent(
  apiFetch: ApiFetcher,
  auth: ZilobaseAuthClient,
  input: {
    accept: boolean;
    workspaceId: string | null;
    oauthQuery: string | null;
    scope?: string;
  },
) {
  if (input.accept) {
    if (!input.workspaceId) throw new Error("Choose a workspace to continue.");
    await auth.setActiveWorkspace(input.workspaceId);
  }
  return apiFetch<OAuthRedirect>("/api/auth/oauth2/consent", {
    method: "POST",
    body: JSON.stringify({
      accept: input.accept,
      oauth_query: input.oauthQuery,
      scope: input.scope?.replaceAll("+", " "),
    }),
  });
}
export async function requestGoogleAuthorization(
  apiFetch: ApiFetcher,
  input: {
    callbackURL: string;
    errorCallbackURL: string;
    invitationId?: string | null;
    oauthQuery: string | null;
  },
) {
  const result = await apiFetch<OAuthRedirect>("/api/auth/sign-in/social", {
    method: "POST",
    body: JSON.stringify({
      provider: "google",
      callbackURL: input.callbackURL,
      errorCallbackURL: input.errorCallbackURL,
      disableRedirect: true,
      ...(input.invitationId ? { invitationId: input.invitationId } : {}),
      ...(input.oauthQuery ? { oauth_query: input.oauthQuery } : {}),
    }),
  });
  if (!result.url) throw new Error("Google sign-in is unavailable.");
  return { ...result, url: result.url };
}
