import assert from "node:assert/strict";
import test from "node:test";
import { DataPublication } from "./publication";

test("scoped publications coalesce coherent changes and isolate entities, families and capabilities", () => {
  const publication = new DataPublication();
  const change = { scopeId: "account", collection: "records", id: "a" };
  const interest = [change];
  const notifications = { exact: 0, scope: 0, other: 0, presence: 0, guest: 0, global: 0 };
  const stop = publication.subscribeTo(interest, () => notifications.exact++);
  publication.subscribeTo([{ scopeId: "account" }], () => notifications.scope++);
  publication.subscribeTo([{ ...change, id: "b" }], () => notifications.other++);
  publication.subscribeTo([{ ...change, collection: "presence" }], () => notifications.presence++);
  publication.subscribeTo([{ ...change, scopeId: "guest" }], () => notifications.guest++);
  publication.subscribe(() => notifications.global++);
  publication.batch(() => {
    publication.changed([], [change]);
    publication.changed([], [change]);
    assert.equal(notifications.exact, 0);
  });
  assert.deepEqual(notifications, {
    exact: 1,
    scope: 1,
    other: 0,
    presence: 0,
    guest: 0,
    global: 1,
  });
  assert.equal(publication.revisionFor(interest), 1);
  assert.equal(publication.revisionFor([{ ...change, scopeId: "guest" }]), 0);
  stop();
  publication.changed([], [change]);
  assert.equal(notifications.exact, 1);
  publication.changed([]); // Identity teardown reaches every remaining consumer.
  assert.equal(notifications.guest, 1);
  publication.dispose();
  publication.changed([], [change]);
  assert.equal(notifications.scope, 3);
});

test("session forwarding preserves entity interests and a coherent parent transaction", () => {
  const session = new DataPublication();
  const client = new DataPublication();
  session.subscribeChanges((changes) => client.changed([], changes));
  let calls = 0;
  client.subscribeTo([{ scopeId: "scope", collection: "records" }], () => calls++);
  session.batch(() => {
    session.changed([], [{ scopeId: "scope", collection: "records", id: "a" }]);
    session.changed([], [{ scopeId: "scope", collection: "pages", id: "p" }]);
  });
  assert.equal(calls, 1);
});
