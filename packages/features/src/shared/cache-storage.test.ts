import assert from "node:assert/strict";
import test from "node:test";
import { createZilobaseClient } from "./client";
import {
  clientReadSnapshot,
  rememberClientSession,
  type ClientCacheStorage,
  type ClientReadSnapshot,
} from "./cache-storage";
import { hydrateClientReadCache, subscribeClientReadCache } from "../pages/read-cache";

const scope = { deployment: "server", userId: "user", sessionId: "session" };
function storage(): ClientCacheStorage {
  return {
    session: { load: async () => null, write: async () => {}, clear: async () => {} },
    snapshots: {
      load: async () => [],
      write: async () => {},
      delete: async () => {},
      clear: async () => {},
    },
  };
}

test("late snapshot restoration cannot install data after the account identity changes", async () => {
  const runtime = createZilobaseClient({ deployment: scope.deployment });
  const port = storage();
  const loading = Promise.withResolvers<ClientReadSnapshot[]>();
  port.snapshots.load = () => loading.promise;
  try {
    const restore = hydrateClientReadCache({
      queryClient: runtime.queryClient,
      storage: port,
      scope,
      sessionId: scope.sessionId,
      pageId: "page",
      workspaceId: "workspace",
      databaseIds: [],
    });
    runtime.queryClient.setQueryData(["session"], {
      user: { id: "another" },
      session: { id: "another" },
    });
    loading.resolve([
      {
        scope: "user",
        queryKey: ["user-settings"],
        data: { privatePreference: true },
        updatedAt: 100,
        bytes: 10,
      },
    ]);
    await restore;
    assert.equal(runtime.queryClient.getQueryData(["user-settings"]), undefined);
  } finally {
    runtime.dispose();
  }
});

test("failed durable writes do not fail successful API reads or store manual previews", async () => {
  const runtime = createZilobaseClient({ deployment: scope.deployment });
  const port = storage();
  let writes = 0;
  port.snapshots.write = async () => {
    writes++;
    throw new Error("disk full");
  };
  const stop = subscribeClientReadCache(runtime.queryClient, port, scope);
  try {
    runtime.queryClient.setQueryData(["user-settings"], { preview: true });
    assert.equal(writes, 0);
    const settings = await runtime.queryClient.fetchQuery({
      queryKey: ["user-settings"],
      staleTime: 0,
      queryFn: async () => ({ confirmed: true }),
    });
    assert.deepEqual(settings, { confirmed: true });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(writes, 1);
  } finally {
    stop();
    runtime.dispose();
  }
});

test("session caching retains its existing null-session policy and deployment scope", async () => {
  const port = storage();
  const calls: unknown[] = [];
  port.session.write = async (deployment, value) => {
    calls.push(["write", deployment, value.user?.id]);
  };
  port.session.clear = async (deployment) => {
    calls.push(["clear", deployment]);
  };
  const user = {
    id: "user",
    email: "user@example.test",
    name: "User",
    emailVerified: true,
    hasPassword: true,
  };
  await rememberClientSession(port, "first", { user, session: null });
  await rememberClientSession(port, "first", {
    user,
    session: { id: "session", userId: user.id, expiresAt: "2099-01-01" },
  });
  await rememberClientSession(port, "second", { user: null, session: null });
  assert.deepEqual(calls, [
    ["write", "first", "user"],
    ["clear", "second"],
  ]);
  assert.equal(
    clientReadSnapshot({
      scope: "user",
      queryKey: ["user-settings"],
      data: "x".repeat(2 * 1024 * 1024),
      updatedAt: 1,
    }),
    null,
  );
});
