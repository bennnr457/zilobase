import assert from "node:assert/strict";
import test from "node:test";
import type { ApiFetcher } from "../shared/api-fetcher";
import { listOAuthApps, listOAuthConsents } from "./queries";
import { requestGoogleAuthorization, submitOAuthConsent } from "./mutations";
import { readOAuthQuery } from "./search";
import { getAuthReturnPath, getInvitationAuthSearch } from "../auth/return-path";

test("OAuth list reads retain array/envelope responses and GET requests", async () => {
  const paths: string[] = [];
  const apiFetch = (async (path: string, init?: RequestInit) => {
    assert.equal(init?.method, "GET");
    paths.push(path);
    return path.endsWith("get-clients")
      ? { clients: [{ client_id: "client" }] }
      : [{ id: "consent" }];
  }) as ApiFetcher;
  assert.deepEqual(await listOAuthApps(apiFetch), [{ client_id: "client" }]);
  assert.deepEqual(await listOAuthConsents(apiFetch), [{ id: "consent" }]);
  assert.deepEqual(paths, ["/api/auth/oauth2/get-clients", "/api/auth/oauth2/get-consents"]);
});

test("OAuth consent selects a workspace before allowing and never selects on denial", async () => {
  const calls: unknown[] = [];
  const apiFetch = (async (path: string, init?: RequestInit) => {
    calls.push([path, JSON.parse(String(init?.body))]);
    return { url: "https://client.test" };
  }) as ApiFetcher;
  const auth = {
    setActiveWorkspace: async (id: string) => {
      calls.push(id);
    },
  } as Parameters<typeof submitOAuthConsent>[1];
  const input = {
    accept: true,
    workspaceId: "workspace",
    oauthQuery: "signed",
    scope: "openid+email",
  };
  await submitOAuthConsent(apiFetch, auth, input);
  assert.deepEqual(calls, [
    "workspace",
    ["/api/auth/oauth2/consent", { accept: true, oauth_query: "signed", scope: "openid email" }],
  ]);
  calls.length = 0;
  await submitOAuthConsent(apiFetch, auth, { ...input, accept: false, workspaceId: null });
  assert.equal(calls.length, 1);
  await assert.rejects(
    submitOAuthConsent(apiFetch, auth, { ...input, workspaceId: null }),
    /Choose a workspace/,
  );
});

test("social authorization returns the URL and retains explicit callback and signed query input", async () => {
  const apiFetch = (async (path: string, init?: RequestInit) => {
    assert.equal(path, "/api/auth/sign-in/social");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      provider: "google",
      callbackURL: "https://app.test/return",
      errorCallbackURL: "https://app.test/login",
      disableRedirect: true,
      invitationId: "invite",
      oauth_query: "signed",
    });
    return { url: "https://provider.test" };
  }) as ApiFetcher;
  const result = await requestGoogleAuthorization(apiFetch, {
    callbackURL: "https://app.test/return",
    errorCallbackURL: "https://app.test/login",
    invitationId: "invite",
    oauthQuery: "signed",
  });
  assert.equal(result.url, "https://provider.test");
  await assert.rejects(
    requestGoogleAuthorization((async () => ({})) as ApiFetcher, {
      callbackURL: "a",
      errorCallbackURL: "b",
      oauthQuery: null,
    }),
    /Google sign-in is unavailable/,
  );
});

test("auth return and invitation parsing runs with explicit platform values", () => {
  const origin = "https://app.test",
    allowed = new Set([origin, "https://api.test"]);
  assert.equal(readOAuthQuery("?oauth_query=signed&client_id=ignored"), "signed");
  assert.equal(
    getAuthReturnPath("/recents", "?returnTo=%2F%2Fevil.test", origin, allowed),
    "/recents",
  );
  assert.equal(
    getAuthReturnPath(
      "/recents",
      "?returnTo=https%3A%2F%2Fapi.test%2Fdesktop%2Fauthorize",
      origin,
      allowed,
    ),
    "https://api.test/desktop/authorize",
  );
  assert.deepEqual(getInvitationAuthSearch("?invitation=a&invitation=b", origin, allowed), {});
  assert.deepEqual(getInvitationAuthSearch("?invitation=abc", origin, allowed), {
    invitation: "abc",
    returnTo: "/accept-invitation?id=abc",
  });
});
