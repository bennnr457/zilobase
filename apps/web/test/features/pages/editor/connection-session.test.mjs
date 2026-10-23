export function register({ assert, loadModule, test }) {
  const load = () =>
    loadModule("/src/sections/pages/editor/collaboration/lib/collaboration-connection.ts");
  function fixture(
    startPageConnection,
    { preparedTicket = null, failAt, failure = new Error("adapter failed") } = {},
  ) {
    const fail = (step) => {
      if (failAt === step) throw failure;
    };
    const failures = [];
    let start, input, resolve, reject, signal;
    const ticket = { documentName: "page:p1", token: "test" };
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const events = [],
      snapshots = {},
      handlers = {};
    const provider = {
      synced: false,
      hasUnsyncedChanges: true,
      setAwarenessField: (key, value) => {
        fail("awareness");
        events.push(["awareness", key, value]);
      },
      on: (key, handler) => {
        fail("subscribe");
        handlers[key] = handler;
      },
      destroy: () => events.push("destroy"),
    };
    const state = Object.fromEntries(
      ["provider", "status", "error", "synced", "unsyncedChanges", "users"].map((key) => [
        key,
        (value) => {
          if (key === "provider" && value) fail("publish");
          snapshots[key] = value;
          events.push([key, value]);
        },
      ]),
    );
    const stop = startPageConnection({
      document: {},
      pageId: "p1",
      preparedTicket,
      user: { id: "u1", name: "User", color: "blue" },
      state,
      services: {
        applyTicket: () => {
          fail("apply");
          events.push("apply");
        },
        connect: (options) => {
          fail("connect");
          input = options;
          events.push("create");
          return provider;
        },
        getTicket: (_id, abortSignal) => {
          signal = abortSignal;
          events.push("ticket");
          fail("ticket");
          return promise;
        },
        isAccessDenied: (reason) => {
          failures.push(reason);
          return [403, 404].includes(reason.status);
        },
        schedule: (callback) => {
          start = callback;
          return () => events.push("cancel");
        },
      },
    });
    return {
      stop,
      start: () => start(),
      input: () => input,
      signal: () => signal,
      events,
      failures,
      snapshots,
      provider,
      handlers,
      resolve: () => resolve(ticket),
      reject,
    };
  }
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  test("connection cancellation aborts pending tickets and ignores late completion", async () => {
    const { startPageConnection } = await load();
    const f = fixture(startPageConnection);
    f.start();
    f.stop();
    assert.equal(f.signal().aborted, true);
    f.resolve();
    await settle();
    assert.equal(f.events.includes("create"), false);
    assert.equal(f.snapshots.provider, null);
    assert.equal(f.snapshots.synced, false);
  });

  test("prepared ticket attaches before explicit connect and reports sync state", async () => {
    const { startPageConnection } = await load();
    const f = fixture(startPageConnection, { preparedTicket: { token: "prepared" } });
    f.start();
    await settle();
    assert.equal(f.events.includes("ticket"), false);
    assert.equal(f.input().autoConnect, false);
    assert.ok(f.events.indexOf("apply") < f.events.indexOf("create"));
    f.input().onUnsyncedChanges(2);
    assert.deepEqual(f.snapshots.unsyncedChanges, 2);
    f.handlers.synced({ state: true });
    assert.equal(f.snapshots.synced, true);
    f.stop();
    const stopped = f.events.length;
    f.input().onAuthenticationFailed("late denial");
    f.input().onUnsyncedChanges(2);
    f.handlers.synced({ state: true });
    assert.equal(f.events.length, stopped);
    assert.ok(f.events.indexOf("cancel") < f.events.indexOf("destroy"));
  });

  test("connection denial blocks; transient failure disconnects", async () => {
    const { startPageConnection } = await load();
    for (const [status, expected, error] of [
      [403, "blocked", "denied"],
      [500, "disconnected", "denied"],
    ]) {
      const f = fixture(startPageConnection);
      f.start();
      f.reject(Object.assign(new Error("denied"), { status }));
      await settle();
      assert.equal(f.snapshots.status, expected);
      assert.equal(f.snapshots.error, error);
      f.stop();
    }
  });

  test("document close on an open socket clears readiness so the session can retry", async () => {
    const { startPageConnection } = await load();
    const f = fixture(startPageConnection, { preparedTicket: {} });
    try {
      f.start();
      await settle();
      f.input().onStatus("connected");
      f.handlers.synced({ state: true });
      f.input().onClose();
      assert.equal(f.snapshots.status, "disconnected");
      assert.equal(f.snapshots.synced, false);
      f.input().onStatus("connecting");
      assert.equal(f.snapshots.synced, false);
      f.input().onStatus("connected");
      f.handlers.synced({ state: true });
      assert.equal(f.snapshots.synced, true);
      f.input().onStatus("disconnected");
      assert.equal(f.snapshots.synced, false);
      f.input().onAuthenticationFailed("Forbidden");
      f.input().onClose();
      assert.equal(f.snapshots.status, "blocked");
    } finally {
      f.stop();
    }
    const stopped = f.events.length;
    f.input().onClose();
    assert.equal(f.events.length, stopped);
  });

  test("presence deduplicates valid users and authentication failure blocks the active document", async () => {
    const { startPageConnection } = await load();
    const f = fixture(startPageConnection, { preparedTicket: {} });
    f.start();
    await settle();
    f.input().onUsers([
      { clientId: 1, user: { id: "u", name: "old", color: "blue" } },
      { clientId: 2, user: { id: "u", name: "new", color: "blue" } },
      { clientId: 3, user: { id: "invalid" } },
    ]);
    assert.equal(f.snapshots.users.length, 1);
    assert.equal(f.snapshots.users[0].name, "new");
    f.input().onAuthenticationFailed("revoked");
    f.input().onStatus("disconnected");
    assert.equal(f.snapshots.status, "blocked");
    assert.equal(f.snapshots.error, "revoked");
    f.stop();
  });

  test("connection startup publishes immediately, requests on schedule and attaches asynchronously", async () => {
    const { startPageConnection } = await load();
    for (const preparedTicket of [null, { token: "prepared" }]) {
      const f = fixture(startPageConnection, { preparedTicket });
      try {
        assert.deepEqual(f.events, [
          ["status", "connecting"],
          ["error", null],
        ]);
        f.start();
        assert.equal(f.events.includes("ticket"), !preparedTicket);
        assert.equal(f.events.includes("apply"), false);
        if (!preparedTicket) f.resolve();
        await settle();
        assert.ok(f.events.indexOf("apply") < f.events.indexOf("create"));
        assert.equal(f.snapshots.provider, f.provider);
      } finally {
        f.stop();
      }
    }
  });

  test("connection adapter failures retain their identity and release any created provider", async () => {
    const { startPageConnection } = await load();
    for (const failAt of ["apply", "connect", "awareness", "subscribe", "publish"]) {
      const failure = Object.assign(new Error(failAt), { status: 403 });
      const f = fixture(startPageConnection, { preparedTicket: {}, failAt, failure });
      f.start();
      await settle();
      assert.equal(f.failures[0], failure);
      assert.equal(f.snapshots.status, "blocked");
      assert.equal(f.snapshots.error, failAt);
      if (failAt === "apply") assert.equal(f.events.includes("create"), false);
      f.stop();
      assert.equal(
        f.events.includes("destroy"),
        ["awareness", "subscribe", "publish"].includes(failAt),
      );
    }
  });

  test("a synchronous ticket adapter throw stays synchronous at the scheduled boundary", async () => {
    const { startPageConnection } = await load();
    const failure = new Error("ticket adapter");
    const f = fixture(startPageConnection, { failAt: "ticket", failure });
    try {
      assert.throws(f.start, (error) => error === failure);
      assert.deepEqual(f.failures, []);
      assert.equal(f.snapshots.status, "connecting");
    } finally {
      f.stop();
    }
  });
}
