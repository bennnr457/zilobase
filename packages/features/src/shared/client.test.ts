import assert from "node:assert/strict";
import test from "node:test";
import { createZilobaseClient, initializeZilobaseClient } from "./client";
import { sharedClient } from "../data/client";
import { stageAuthorizedPages, resolvePageReference } from "../pages/cache";

const page = {
  id: "page",
  workspaceId: "workspace",
  name: "Original",
  type: "pageblock",
  url: "#",
  createdAt: "2026-10-14T00:00:00Z",
  updatedAt: "2026-10-14T00:00:00Z",
};

test("one initialization serves pre-render reads and provider installation without losing collections", () => {
  let deployment = "first";
  const runtime = createZilobaseClient({ deployment: () => deployment });
  try {
    const data = sharedClient(runtime.queryClient);
    const [ref] = stageAuthorizedPages(runtime.queryClient, data.capture(), "workspace", [page]);
    assert.equal(
      initializeZilobaseClient(runtime.queryClient, () => deployment),
      data,
    );
    assert.equal(resolvePageReference(runtime.queryClient, ref!)?.name, "Original");
    deployment = "second";
    assert.equal(resolvePageReference(runtime.queryClient, ref!), null);
    assert.equal(data.all().length, 0);
  } finally {
    runtime.dispose();
  }
});

test("independent runtimes isolate accounts and disposal removes installed owners", () => {
  const first = createZilobaseClient({ deployment: "server" });
  const second = createZilobaseClient({ deployment: "server" });
  try {
    const data = sharedClient(first.queryClient);
    const read = data.capture();
    stageAuthorizedPages(first.queryClient, read, "workspace", [page]);
    assert.equal(sharedClient(second.queryClient).all().length, 0);
    first.queryClient.setQueryData(["session"], {
      user: { id: "account" },
      session: { id: "session" },
    });
    assert.throws(() => data.resolve(read, "workspace"), /expired/);
    first.dispose();
    assert.throws(() => sharedClient(first.queryClient), /must be installed/);
    assert.notEqual(initializeZilobaseClient(first.queryClient, "server"), data);
  } finally {
    first.dispose();
    second.dispose();
  }
});

test("account changes clear ordinary queries and cancel late requests from the previous identity", async () => {
  const runtime = createZilobaseClient({ deployment: "server" });
  const client = runtime.queryClient;
  client.setQueryData(["session"], { user: { id: "first" }, session: { id: "s1" } });
  client.setQueryData(["user-settings"], { private: "first" });
  let complete!: (value: string) => void;
  const request = client.fetchQuery({
    queryKey: ["account-details"],
    queryFn: () =>
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
  });
  const canceled = assert.rejects(request);
  client.setQueryData(["session"], { user: { id: "second" }, session: { id: "s2" } });
  assert.equal(client.getQueryData(["user-settings"]), undefined);
  complete("old account");
  await canceled;
  assert.equal(client.getQueryData(["account-details"]), undefined);
  client.setQueryData(["user-settings"], { private: "second" });
  client.setQueryData(["session"], { user: null, session: null });
  assert.equal(client.getQueryData(["user-settings"]), undefined);
  runtime.dispose();
});
