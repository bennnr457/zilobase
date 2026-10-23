import * as Y from "yjs";
export function register({ assert, loadModule, test }) {
  test("document leases share transport and stale release cannot dispose a replacement", async () => {
    const { createDocumentSessionRegistry } = await loadModule(
      "/src/sections/pages/editor/collaboration/lib/page-document-session.ts",
    );
    const registry = createDocumentSessionRegistry();
    let disposed = 0;
    const create = () => ({
      dispose: () => {
        disposed++;
      },
    });
    const a = registry.acquire("deployment:account:page:1", create),
      b = registry.acquire("deployment:account:page:1", create);
    assert.equal(a.session, b.session);
    a.release();
    assert.equal(disposed, 0);
    b.release();
    assert.equal(disposed, 1);
    const next = registry.acquire("deployment:account:page:1", create);
    b.release();
    assert.equal(disposed, 1);
    assert.notEqual(next.session, a.session);
    next.release();
    assert.equal(disposed, 2);
    assert.equal(registry.size, 0);
  });
  async function fixture({ persisted = true, denied = false } = {}) {
    const { createPageDocumentSession } = await loadModule(
      "/src/sections/pages/editor/collaboration/lib/page-document-session.ts",
    );
    const document = new Y.Doc();
    const events = [];
    const timers = new Map();
    const originalSet = globalThis.setTimeout,
      originalClear = globalThis.clearTimeout;
    globalThis.setTimeout = (callback, delay) => {
      const token = {};
      timers.set(token, { callback, delay });
      return token;
    };
    globalThis.clearTimeout = (token) => timers.delete(token);
    let online = true,
      connection,
      connectivity,
      resume;
    const connections = [];
    const provider = {
      connect: async () => {},
      disconnect: () => {},
      forceSync: () => events.push("forceSync"),
      synced: true,
    };
    const entry = {
      document,
      hasPersistedState: persisted,
      locallyChanged: false,
      persistenceError: null,
      blocked: false,
      errorListeners: new Set(),
      flush: async () => events.push("flush"),
    };
    const session = createPageDocumentSession(
      { user: { id: "a", color: "red", name: "A" }, pageId: "p" },
      {
        acquire: async () => {
          events.push("acquire");
          return entry;
        },
        release: () => events.push("release"),
        initialize: async () => events.push("initialize"),
        unblock: async () => {
          entry.blocked = false;
        },
        verify: async () => {},
        isAccessDenied: (error) => error.message === "denied",
        getTicket: async () => {
          events.push("ticket");
          if (denied) throw new Error("denied");
          return { initialState: "seed" };
        },
        applyTicket: () => {
          events.push("hydrate");
          document.getText("body").insert(0, "server");
        },
        awareness: () => ({
          clientID: document.clientID,
          meta: new Map([[document.clientID, { clock: 0, lastUpdated: Date.now() }]]),
          destroyed: false,
          destroy() {
            this.destroyed = true;
            events.push("awareness:destroy");
          },
        }),
        online: () => online,
        subscribeConnectivity: (listener) => {
          connectivity = listener;
          return () => events.push("unsubscribe");
        },
        subscribeResume: (listener) => {
          resume = listener;
          return () => events.push("unsubscribe:resume");
        },
        schedule: (callback) => {
          callback();
          return () => {};
        },
        connect: ({ publish, awareness }) => {
          events.push("connect");
          connections.push({ publish, awareness });
          connection = publish;
          publish({ status: "connecting" });
          return () => {
            events.push("disconnect");
            awareness.destroy();
          };
        },
      },
    );
    const flush = async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    await flush();
    return {
      session,
      document,
      entry,
      events,
      connections,
      provider,
      flush,
      resume: () => resume(),
      connection: (patch) => connection(patch),
      online: (value) => {
        online = value;
        connectivity();
      },
      expire: (delay) => {
        for (const [token, timer] of [...timers])
          if (timer.delay === delay) {
            timers.delete(token);
            timer.callback();
          }
      },
      timers,
      dispose: () => {
        session.dispose();
        document.destroy();
        globalThis.setTimeout = originalSet;
        globalThis.clearTimeout = originalClear;
      },
    };
  }
  test("cold session hydrates durable Yjs before connection; cached session allows startup typing", async () => {
    for (const persisted of [false, true]) {
      const f = await fixture({ persisted });
      try {
        assert.equal(f.session.getSnapshot().document, f.document);
        assert.equal(f.session.getSnapshot().canEdit, true);
        if (!persisted)
          assert.deepEqual(f.events.slice(0, 5), [
            "acquire",
            "ticket",
            "hydrate",
            "flush",
            "initialize",
          ]);
        else assert.deepEqual(f.events, ["acquire", "connect"]);
        f.document.getText("body").insert(f.document.getText("body").length, "typed");
        f.connection({ status: "connected", synced: true });
        assert.equal(f.session.getSnapshot().canEdit, true);
        f.expire(20_000);
        assert.equal(f.session.getSnapshot().canEdit, true);
        f.online(false);
        assert.equal(f.session.getSnapshot().canEdit, false);
        f.online(true);
        f.connection({ status: "connected", synced: true });
        assert.equal(f.session.getSnapshot().canEdit, true);
        assert.ok(f.document.getText("body").toString().endsWith("typed"));
      } finally {
        f.dispose();
      }
      assert.equal(f.events.filter((event) => event === "release").length, 1);
      assert.equal(f.entry.errorListeners.size, 0);
    }
  });
  test("startup timeout and disconnect lock content until confirmed sync", async () => {
    const f = await fixture();
    try {
      f.expire(20_000);
      assert.equal(f.session.getSnapshot().canEdit, false);
      f.connection({ status: "connected", synced: true });
      assert.equal(f.session.getSnapshot().canEdit, true);
      f.connection({ status: "disconnected", synced: false });
      assert.equal(f.session.getSnapshot().canEdit, false);
      f.expire(3_000);
      assert.equal(f.events.filter((event) => event === "connect").length, 2);
    } finally {
      f.dispose();
    }
  });
  test("cold authorization denial blocks retries and retains no transport", async () => {
    const f = await fixture({ persisted: false, denied: true });
    try {
      assert.equal(f.session.getSnapshot().status, "blocked");
      assert.equal(f.session.getSnapshot().canEdit, false);
      assert.equal(f.events.includes("connect"), false);
      assert.equal(f.events.filter((event) => event === "release").length, 1);
      assert.equal(f.timers.size, 0);
    } finally {
      f.dispose();
    }
  });
  test("a socket that opens without syncing is replaced without losing local edits", async () => {
    const f = await fixture();
    try {
      f.document.getText("body").insert(0, "unsaved draft");
      f.entry.locallyChanged = true;
      const first = f.connections[0];
      first.awareness.meta.get(f.document.clientID).clock = 50;
      f.connection({ status: "connected", synced: false });
      f.expire(20_000);
      assert.equal(f.session.getSnapshot().canEdit, false);
      f.expire(30_000);
      assert.equal(f.connections.length, 2);
      assert.equal(first.awareness.destroyed, true);
      assert.notEqual(f.session.getSnapshot().awareness, first.awareness);
      assert.equal(f.session.getSnapshot().awareness.destroyed, false);
      assert.ok(f.session.getSnapshot().awareness.meta.get(f.document.clientID).clock > 50);
      first.publish({ status: "blocked", error: "late denial" });
      assert.equal(f.session.getSnapshot().error, null);
      f.connection({ status: "connected", synced: true });
      assert.equal(f.session.getSnapshot().canEdit, true);
      assert.equal(f.session.getSnapshot().document, f.document);
      assert.equal(f.document.getText("body").toString(), "unsaved draft");
      assert.equal(f.entry.locallyChanged, true);
    } finally {
      f.dispose();
    }
  });
  test("a recovered connection cancels the delayed replacement", async () => {
    const f = await fixture();
    try {
      f.connection({ status: "connected", synced: true });
      f.connection({ status: "disconnected", synced: false });
      f.connection({ status: "connected", synced: true });
      f.expire(3_000);
      f.expire(30_000);
      assert.equal(f.connections.length, 1);
      assert.equal(f.session.getSnapshot().canEdit, true);
    } finally {
      f.dispose();
    }
  });
  test("returning to a tab probes sync and replaces an unresponsive socket", async () => {
    const f = await fixture();
    try {
      f.connection({ provider: f.provider, status: "connected", synced: true });
      f.expire(20_000);
      f.resume();
      assert.equal(f.events.filter((event) => event === "forceSync").length, 1);
      assert.equal(f.provider.synced, false);
      assert.equal(f.session.getSnapshot().canEdit, false);
      f.resume();
      assert.equal(f.connections.length, 1);
      f.expire(30_000);
      assert.equal(f.connections.length, 2);
      f.connection({ status: "connected", synced: true });
      assert.equal(f.session.getSnapshot().canEdit, true);
    } finally {
      f.dispose();
    }
  });
  test("a successful foreground sync keeps the current transport and clears its deadline", async () => {
    const f = await fixture();
    try {
      f.connection({ provider: f.provider, status: "connected", synced: true });
      f.expire(20_000);
      f.resume();
      f.connection({ synced: true });
      f.expire(30_000);
      assert.equal(f.connections.length, 1);
      assert.equal(f.session.getSnapshot().canEdit, true);
    } finally {
      f.dispose();
    }
  });
  test("resume recovers disconnected sessions but cannot reopen denied or offline pages", async () => {
    const f = await fixture();
    try {
      f.connection({ status: "disconnected", synced: false });
      f.resume();
      assert.equal(f.connections.length, 2);
      f.expire(3_000);
      assert.equal(f.connections.length, 2);
      f.connection({ status: "blocked", error: "Forbidden", synced: false });
      f.resume();
      f.expire(30_000);
      assert.equal(f.connections.length, 2);
      assert.equal(f.session.getSnapshot().canEdit, false);
      f.online(false);
      f.resume();
      f.online(true);
      f.resume();
      assert.equal(f.connections.length, 2);
      assert.equal(f.session.getSnapshot().status, "blocked");
    } finally {
      f.dispose();
    }
    assert.equal(f.timers.size, 0);
    assert.ok(f.events.includes("unsubscribe:resume"));
  });
}
