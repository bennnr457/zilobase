import type { ApiFetcher } from "../shared/api-fetcher";
import type { ZilobaseAuthClient } from "../shared/auth-client";
import {
  captureClientOperation,
  type AuthenticatedClientOperationContext,
  type ClientOperationContext,
} from "../shared/operation-context";
import type {
  CreateOAuthAppInput,
  OAuthApp,
  OAuthConsent,
  OAuthRedirect,
  PublicOAuthClient,
  RequestGoogleAuthorizationInput,
  RequestGoogleAuthorizationResult,
} from "./contracts";
function oauthApiFetch(context: ApiFetcher | ClientOperationContext): ApiFetcher {
  return typeof context === "function" ? context : captureClientOperation(context).context.apiFetch;
}

export async function listOAuthApps(context: ApiFetcher | ClientOperationContext) {
  const apiFetch = oauthApiFetch(context);
  const result = await apiFetch<OAuthApp[] | { clients?: OAuthApp[] }>(
    "/api/auth/oauth2/get-clients",
    { method: "GET" },
  );
  return Array.isArray(result) ? result : (result.clients ?? []);
}
export async function listOAuthConsents(context: ApiFetcher | ClientOperationContext) {
  const apiFetch = oauthApiFetch(context);
  const result = await apiFetch<OAuthConsent[] | { consents?: OAuthConsent[] }>(
    "/api/auth/oauth2/get-consents",
    { method: "GET" },
  );
  return Array.isArray(result) ? result : (result.consents ?? []);
}
export function publicOAuthClient(context: ApiFetcher | ClientOperationContext, clientId: string) {
  const apiFetch = oauthApiFetch(context);
  return apiFetch<PublicOAuthClient>(
    `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
    { method: "GET" },
  );
}

export function createOAuthApp(
  context: ApiFetcher | ClientOperationContext,
  input: CreateOAuthAppInput,
) {
  const apiFetch = oauthApiFetch(context);
  return apiFetch<OAuthApp>("/api/auth/oauth2/create-client", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function deleteOAuthApp(context: ApiFetcher | ClientOperationContext, clientId: string) {
  const apiFetch = oauthApiFetch(context);
  return apiFetch("/api/auth/oauth2/delete-client", {
    method: "POST",
    body: JSON.stringify({ client_id: clientId }),
  });
}
export function revokeOAuthConsent(context: ApiFetcher | ClientOperationContext, id: string) {
  const apiFetch = oauthApiFetch(context);
  return apiFetch("/api/auth/oauth2/delete-consent", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}
export type SubmitOAuthConsentInput = {
  accept: boolean;
  workspaceId: string | null;
  oauthQuery: string | null;
  scope?: string;
};
export function submitOAuthConsent(
  context: AuthenticatedClientOperationContext,
  input: SubmitOAuthConsentInput,
): Promise<OAuthRedirect>;
export function submitOAuthConsent(
  apiFetch: ApiFetcher,
  auth: ZilobaseAuthClient,
  input: SubmitOAuthConsentInput,
): Promise<OAuthRedirect>;
export async function submitOAuthConsent(
  source: ApiFetcher | AuthenticatedClientOperationContext,
  authOrInput: ZilobaseAuthClient | SubmitOAuthConsentInput,
  legacyInput?: SubmitOAuthConsentInput,
): Promise<OAuthRedirect> {
  const context = typeof source === "function" ? null : captureClientOperation(source).context;
  const apiFetch = context?.apiFetch ?? (source as ApiFetcher);
  const auth = context?.auth ?? (authOrInput as ZilobaseAuthClient);
  const input = context ? (authOrInput as SubmitOAuthConsentInput) : legacyInput!;
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
  context: ApiFetcher | ClientOperationContext,
  input: RequestGoogleAuthorizationInput,
): Promise<RequestGoogleAuthorizationResult> {
  const apiFetch = oauthApiFetch(context);
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
