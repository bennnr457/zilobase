import assert from "node:assert/strict";
import test from "node:test";
import { createMutationTestRuntime } from "../shared/mutation-runtime.test";
import { useCreateOAuthApp, useDeleteOAuthApp, useRevokeOAuthConsent } from "./hooks";

test("OAuth write hooks use the configured API and keep one-time credentials outside mutation cache", async () => {
  const requests: { path: string; body: unknown }[] = [];
  const secret = { client_id: "client", client_secret: "one-time-secret" };
  const apiFetch = async <T>(path: string, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    requests.push({ path, body: JSON.parse(String(init?.body)) });
    return secret as T;
  };
  const create = createMutationTestRuntime(useCreateOAuthApp, apiFetch);
  const remove = createMutationTestRuntime(useDeleteOAuthApp, apiFetch);
  const revoke = createMutationTestRuntime(useRevokeOAuthConsent, apiFetch);
  try {
    const input = {
      application_type: "web" as const,
      client_name: "App",
      redirect_uris: ["https://client.test/callback"],
      token_endpoint_auth_method: "client_secret_basic" as const,
    };
    assert.equal(await create.mutation(input), secret);
    await remove.mutation("client");
    await revoke.mutation("consent");
    assert.deepEqual(requests, [
      { path: "/api/auth/oauth2/create-client", body: input },
      { path: "/api/auth/oauth2/delete-client", body: { client_id: "client" } },
      { path: "/api/auth/oauth2/delete-consent", body: { id: "consent" } },
    ]);
    for (const { queryClient } of [create, remove, revoke]) {
      assert.deepEqual(queryClient.getMutationCache().getAll(), []);
      assert.deepEqual(queryClient.getQueryCache().getAll(), []);
    }
  } finally {
    for (const { queryClient } of [create, remove, revoke]) queryClient.clear();
  }
});
