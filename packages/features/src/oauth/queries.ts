import type { ApiFetcher } from "../shared/api-fetcher";
import type { OAuthApp, OAuthConsent, PublicOAuthClient } from "./contracts";

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
