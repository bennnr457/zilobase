import assert from "node:assert/strict";
import test from "node:test";
import { TestQueryClient } from "../../data/testing";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { DatabaseRealtimeManager } from "./realtime";

test("database realtime uses supplied connectivity and visibility with the existing hidden grace period", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const previousSocket = globalThis.WebSocket;
  const sockets: FakeSocket[] = [];
  class FakeSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    readyState = 0;
    constructor(..._args: unknown[]) {
      super();
      sockets.push(this);
    }
    send() {}
    close() {
      this.readyState = 3;
      this.dispatchEvent(new Event("close"));
    }
  }
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  t.after(() => {
    globalThis.WebSocket = previousSocket;
  });
  const queryClient = new TestQueryClient();
  t.after(() => queryClient.clear());
  let online = false,
    visible = true,
    listener: (() => void) | undefined;
  const lifecycle = {
    isOnline: () => online,
    isVisible: () => visible,
    subscribe: (next: () => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
  };
  const apiFetch = (async () => ({
    databaseId: "db",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    sessionId: "peer",
    token: "ticket",
    version: 0,
    websocketProtocols: [],
    websocketUrl: "ws://test",
  })) as ApiFetcher;
  const manager = new DatabaseRealtimeManager(
    queryClient,
    apiFetch,
    "db",
    "session",
    () => {},
    lifecycle,
  );
  const unsubscribe = manager.subscribe(() => {});
  assert.equal(sockets.length, 0);
  online = true;
  listener!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(sockets.length, 1);
  sockets[0].readyState = FakeSocket.OPEN;
  visible = false;
  listener!();
  t.mock.timers.tick(59_999);
  assert.equal(sockets[0].readyState, FakeSocket.OPEN);
  t.mock.timers.tick(1);
  assert.equal(sockets[0].readyState, 3);
  assert.equal(manager.getSnapshot().status, "offline");
  visible = true;
  listener!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(sockets.length, 2);
  sockets[1].readyState = FakeSocket.OPEN;
  online = false;
  listener!();
  assert.equal(sockets[1].readyState, 3);
  assert.equal(manager.getSnapshot().status, "offline");
  unsubscribe();
  t.mock.timers.tick(4_000);
  assert.equal(listener, undefined);
});
