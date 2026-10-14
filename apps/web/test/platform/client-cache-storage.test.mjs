import "fake-indexeddb/auto";
import Dexie from "dexie";

export function register({ assert, loadModule, test }) {
  test("durable cache upgrades retain sessions and eligible snapshots in the existing database", async () => {
    const cache = await loadModule("/apps/web/test/support/fixtures/page-cache.ts");
    cache.pageCacheDatabase.close();
    await Dexie.delete("zilobase-page-cache-v1");
    const legacy = new Dexie("zilobase-page-cache-v1");
    legacy.version(3).stores({
      pages: "key,userId,updatedAt",
      updates: "++id,key",
      sessions: "key",
      snapshots: "key,scopeKey,userId,updatedAt",
    });
    await legacy.open();
    const session = { user: { id: "upgrade-user" }, session: { id: "upgrade-session" } };
    await legacy.table("sessions").put({ key: "server", value: session });
    await legacy.table("pages").put({
      key: "server:upgrade-user:page",
      userId: "upgrade-user",
      detail: { private: true },
      updatedAt: 1,
    });
    const snapshot = (key, queryKey, scopeKey) => ({
      key,
      queryKey,
      scopeKey,
      userId: "upgrade-user",
      data: { retained: true },
      updatedAt: 1,
      bytes: 20,
    });
    await legacy
      .table("snapshots")
      .bulkPut([
        snapshot(
          "server:upgrade-user:user:settings",
          ["user-settings"],
          "server:upgrade-user:user",
        ),
        snapshot(
          "server:upgrade-user:page:page:detail",
          ["page", "page"],
          "server:upgrade-user:page:page",
        ),
      ]);
    legacy.close();
    await cache.pageCacheDatabase.open();
    assert.deepEqual(await cache.webClientCacheStorage.session.load("server"), session);
    const rows = await cache.webClientCacheStorage.snapshots.load(
      { deployment: "server", userId: "upgrade-user" },
      ["user", "page:page"],
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].queryKey, ["user-settings"]);
    assert.equal(
      "detail" in (await cache.pageCacheDatabase.pages.get("server:upgrade-user:page")),
      false,
    );
    await cache.clearPageCacheForUser("upgrade-user");
    await cache.webClientCacheStorage.session.clear("server");
  });

  test("atomic snapshot writes preserve newer revisions, propagate storage errors, and protect logout clearing", async () => {
    const cache = await loadModule("/apps/web/test/support/fixtures/page-cache.ts");
    const storage = cache.webClientCacheStorage;
    const scope = { deployment: "server", userId: "port-user" };
    const row = {
      scope: "user",
      queryKey: ["user-settings"],
      data: { revision: 2 },
      updatedAt: 2,
      bytes: 20,
    };
    await storage.snapshots.write(scope, row);
    await storage.snapshots.write(scope, { ...row, data: { revision: 1 }, updatedAt: 1 });
    assert.deepEqual((await storage.snapshots.load(scope, ["user"]))[0].data, row.data);
    const fail = () => {
      throw new Error("storage unavailable");
    };
    cache.pageCacheDatabase.snapshots.hook("creating", fail);
    try {
      await assert.rejects(
        storage.snapshots.write(scope, { ...row, queryKey: ["another"] }),
        /storage unavailable/,
      );
    } finally {
      cache.pageCacheDatabase.snapshots.hook("creating").unsubscribe(fail);
    }
    assert.equal((await storage.snapshots.load(scope, ["user"])).length, 1);
    const pending = storage.snapshots.write(scope, { ...row, updatedAt: 3 });
    await storage.snapshots.clear(scope);
    await pending;
    await storage.snapshots.write(scope, row);
    assert.deepEqual(await storage.snapshots.load(scope, ["user"]), []);
    await storage.session.write(scope.deployment, {
      user: { id: scope.userId },
      session: { id: "session" },
    });
    await storage.snapshots.write(scope, row);
    assert.equal((await storage.snapshots.load(scope, ["user"])).length, 1);
    await storage.snapshots.clear(scope);
    await storage.session.clear(scope.deployment);
  });
}
