import { test } from "node:test";
import assert from "node:assert/strict";
import { createZilobaseClient } from "../shared/client";
import { sessionQueryKey } from "../auth/queries";
import { pageQueryOptions } from "./queries";
import { resolvePageDetailReference } from "./cache";
import { createEditorBridge } from "./editor-bridge-controller";
import { acceptEditorChangeNotification } from "./editor-host";
import {
  type EditorBridgeMessage,
  type EditorBridgeScope,
  type EditorBridgeRequest,
  type EditorBridgeStatus,
} from "./editor-bridge";
const scope: EditorBridgeScope = {
  deployment: "server",
  accountId: "a",
  sessionId: "s",
  workspaceId: "w",
};
function fixture() {
  const messages: EditorBridgeMessage[] = [];
  const operations: string[] = [];
  let status: EditorBridgeStatus = { pageId: null, state: "closed" };
  let fail = false;
  let credential: string | null = null;
  const bridge = createEditorBridge(
    {
      async initialize(_, token) {
        operations.push("initialize");
        credential = token;
        if (fail) throw new Error(token);
        status = { pageId: null, state: "connecting" };
      },
      async openPage(pageId) {
        operations.push("open");
        status = { pageId, state: "pending" };
      },
      focus() {
        operations.push("focus");
      },
      async flushLocal() {
        operations.push("flush");
        if (fail) throw new Error("storage");
      },
      async close() {
        operations.push("close");
        credential = null;
        status = { pageId: null, state: "closed" };
      },
      status: () => status,
    },
    (message) => messages.push(message),
  );
  let id = 0;
  const request = (
    command: EditorBridgeRequest["command"],
    patch: Partial<EditorBridgeRequest> = {},
  ) => ({ version: 1, instanceId: "editor", scope, requestId: `r${++id}`, command, ...patch });
  return {
    bridge,
    messages,
    operations,
    request,
    credential: () => credential,
    fail: () => {
      fail = true;
    },
  };
}
test("bridge rejects invalid versions, envelopes, unknown commands and credential smuggling", async () => {
  const f = fixture();
  const initialize = f.request({ type: "initialize", sessionToken: "secret" });
  for (const raw of [
    { ...initialize, version: 2 },
    { ...initialize, requestId: "" },
    { ...initialize, scope: { ...scope, sessionId: "" } },
    { ...initialize, credential: "extra" },
    { ...initialize, command: { type: "setContent", content: {} } },
  ])
    assert.equal(await f.bridge.receive(raw), false);
  assert.deepEqual(f.operations, []);
});
test("commands preserve pending status after local flush and discard credentials on close", async () => {
  const f = fixture();
  await f.bridge.receive(f.request({ type: "initialize", sessionToken: "secret" }));
  await f.bridge.receive(f.request({ type: "openPage", pageId: "p" }));
  await f.bridge.receive(f.request({ type: "focus" }));
  await f.bridge.receive(f.request({ type: "flushLocal" }));
  const flushed = f.messages.at(-1)!;
  assert.equal(flushed.type, "response");
  if (flushed.type === "response" && flushed.result.ok) {
    assert.equal(flushed.result.locallyFlushed, true);
    assert.equal(flushed.result.status.state, "pending");
  }
  await f.bridge.receive(f.request({ type: "close" }));
  assert.equal(f.credential(), null);
  assert.equal(JSON.stringify(f.messages).includes("secret"), false);
  assert.deepEqual(f.operations, ["close", "initialize", "open", "focus", "flush", "close"]);
});
test("replayed requests never execute twice and identity violations tear down the runtime", async () => {
  const f = fixture();
  const init = f.request({ type: "initialize", sessionToken: "secret" });
  assert.equal(await f.bridge.receive(init), true);
  assert.equal(await f.bridge.receive(init), false);
  for (const property of ["deployment", "accountId", "sessionId", "workspaceId"] as const) {
    await f.bridge.receive(f.request({ type: "initialize", sessionToken: "secret" }));
    assert.equal(
      await f.bridge.receive(
        f.request({ type: "focus" }, { scope: { ...scope, [property]: "different" } }),
      ),
      false,
    );
    assert.equal(f.credential(), null);
  }
  await f.bridge.receive(f.request({ type: "initialize", sessionToken: "secret" }));
  assert.equal(
    await f.bridge.receive(f.request({ type: "status" }, { instanceId: "old-editor" })),
    false,
  );
  assert.equal(f.credential(), null);
});
test("initialization and storage errors stay sanitized and disposal suppresses late events", async () => {
  const f = fixture();
  f.fail();
  assert.equal(
    await f.bridge.receive(f.request({ type: "initialize", sessionToken: "secret" })),
    false,
  );
  assert.equal(f.credential(), null);
  assert.equal(JSON.stringify(f.messages).includes("secret"), false);
  await f.bridge.dispose();
  const count = f.messages.length;
  f.bridge.notify({ type: "navigation", target: { kind: "page", id: "p" } });
  assert.equal(await f.bridge.receive(f.request({ type: "status" })), false);
  assert.equal(f.messages.length, count);
});
test("independent host/editor Query and DB runtimes reconcile only scoped confirmed notifications", async () => {
  const host = createZilobaseClient({ deployment: "server" });
  const editor = createZilobaseClient({ deployment: "server" });
  const session = { user: { id: "a" }, session: { id: "s", activeWorkspaceId: "w" } };
  host.queryClient.setQueryData(sessionQueryKey, session);
  editor.queryClient.setQueryData(sessionQueryKey, session);
  let title = "Before";
  const fetchPage = async <T>() =>
    ({
      page: {
        id: "p",
        workspaceId: "w",
        name: title,
        updatedAt: title === "Before" ? "2026-01-01T00:00:00Z" : "2026-01-02T00:00:00Z",
      },
      accessLevel: "full",
    }) as T;
  await host.queryClient.fetchQuery(pageQueryOptions(fetchPage, "p"));
  title = "Confirmed";
  await editor.queryClient.fetchQuery(pageQueryOptions(fetchPage, "p"));
  const get = (client: typeof host) =>
    resolvePageDetailReference(client.queryClient, client.queryClient.getQueryData(["page", "p"]))
      ?.page.name;
  assert.equal(get(host), "Before");
  assert.equal(get(editor), "Confirmed");
  const message: EditorBridgeMessage = {
    version: 1,
    instanceId: "editor",
    scope,
    type: "event",
    event: { type: "changed", records: [{ kind: "page", id: "p" }] },
  };
  assert.equal(
    await acceptEditorChangeNotification(
      host.queryClient,
      { instanceId: "editor", scope },
      { ...message, scope: { ...scope, sessionId: "old" } },
    ),
    false,
  );
  assert.equal(host.queryClient.getQueryState(["page", "p"])?.isInvalidated, false);
  assert.equal(
    await acceptEditorChangeNotification(
      host.queryClient,
      { instanceId: "editor", scope },
      message,
    ),
    true,
  );
  await host.queryClient.fetchQuery(pageQueryOptions(fetchPage, "p"));
  assert.equal(get(host), "Confirmed");
  host.queryClient.setQueryData(sessionQueryKey, {
    ...session,
    session: { ...session.session, activeWorkspaceId: "another-workspace" },
  });
  assert.equal(
    await acceptEditorChangeNotification(
      host.queryClient,
      { instanceId: "editor", scope },
      message,
    ),
    false,
  );
  editor.dispose();
  assert.equal(get(host), "Confirmed");
  host.dispose();
});

test("storage failures cannot acknowledge local flush or emit confirmed changes", async () => {
  const f = fixture();
  await f.bridge.receive(f.request({ type: "initialize", sessionToken: "secret" }));
  await f.bridge.receive(f.request({ type: "openPage", pageId: "p" }));
  f.fail();
  assert.equal(await f.bridge.receive(f.request({ type: "flushLocal" })), false);
  assert.equal(f.messages.at(-1)?.type, "response");
  const response = f.messages.at(-1)!;
  if (response.type === "response")
    assert.deepEqual(response.result, { ok: false, code: "operation_failed" });
  f.bridge.notify({ type: "navigation", target: { kind: "page", id: "another" } });
  assert.deepEqual(f.messages.at(-1), {
    version: 1,
    type: "event",
    instanceId: "editor",
    scope,
    event: { type: "navigation", target: { kind: "page", id: "another" } },
  });
  assert.equal(
    f.messages.some((message) => message.type === "event" && message.event.type === "changed"),
    false,
  );
  await f.bridge.dispose();
});
