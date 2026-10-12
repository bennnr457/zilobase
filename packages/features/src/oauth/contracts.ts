export type OAuthApp = {
  client_id?: string;
  client_name?: string;
  client_secret?: string;
  name?: string;
  redirect_uris?: string[];
};
export type OAuthConsent = {
  clientId?: string;
  client_id?: string;
  createdAt?: string;
  id: string;
  name?: string;
  scopes?: string[];
};
export type PublicOAuthClient = Pick<OAuthApp, "client_id" | "client_name" | "name">;
export type OAuthRedirect = { redirect?: boolean; url?: string };
export type CreateOAuthAppInput = {
  application_type: "native" | "web";
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none" | "client_secret_basic";
};
