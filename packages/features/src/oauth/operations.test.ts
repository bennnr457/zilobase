import assert from "node:assert/strict";
import test from "node:test";
import type { ApiFetcher } from "../shared/api-fetcher";
import type { ZilobaseAuthClient } from "../shared/auth-client";
import { createZilobaseClient } from "../shared/client";
import { ExpiredClientOperationError } from "../shared/operation-context";
import { createOAuthApp, submitOAuthConsent } from "./index";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const first = { user: { id: "a" }, session: { id: "a-session" } };
const second = { user: { id: "b" }, session: { id: "b-session" } };

test("context-based OAuth writes reject late results after account replacement", async () => {
  const request = deferred<unknown>();
  const runtime = createZilobaseClient({ deployment: "test" });
  const apiFetch: ApiFetcher = <T>() => request.promise as Promise<T>;
  runtime.queryClient.setQueryData(["session"], first);
  try {
    const pending = createOAuthApp(
      { apiFetch, queryClient: runtime.queryClient },
      {
        application_type: "web",
        client_name: "Example",
        redirect_uris: ["https://example.com/callback"],
        token_endpoint_auth_method: "none",
      },
    );
    const rejected = assert.rejects(pending, ExpiredClientOperationError);
    runtime.queryClient.setQueryData(["session"], second);
    request.resolve({ client_id: "old-client" });
    await rejected;
    assert.deepEqual(runtime.queryClient.getQueryData(["session"]), second);
  } finally {
    runtime.dispose();
  }
});
test("consent cannot be submitted for a replacement account after an in-flight workspace change", async () => {
  const active = deferred<unknown>();
  let consentRequests = 0;
  const runtime = createZilobaseClient({ deployment: "test" });
  runtime.queryClient.setQueryData(["session"], first);
  const apiFetch: ApiFetcher = async <T>() => {
    consentRequests++;
    return {} as T;
  };
  const auth = { setActiveWorkspace: () => active.promise } as unknown as ZilobaseAuthClient;
  try {
    const pending = submitOAuthConsent(
      { apiFetch, auth, queryClient: runtime.queryClient },
      { accept: true, workspaceId: "workspace", oauthQuery: "query" },
    );
    const rejected = assert.rejects(pending, ExpiredClientOperationError);
    runtime.queryClient.setQueryData(["session"], second);
    active.resolve({});
    await rejected;
    assert.equal(consentRequests, 0);
  } finally {
    runtime.dispose();
  }
});
