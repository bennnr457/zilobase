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
