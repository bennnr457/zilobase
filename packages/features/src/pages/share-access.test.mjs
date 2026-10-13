import assert from "node:assert/strict";
import test from "node:test";
import { TestQueryClient } from "../data/testing.ts";
import { cachePageDetail } from "./cache.ts";
import { decidePageShareAccess } from "./publication.ts";
const page = {
  id: "page",
  workspaceId: "workspace",
  name: "Page",
  type: "pageblock",
  url: "#",
  createdAt: "2026-10-12T00:00:00Z",
  updatedAt: "2026-10-12T00:00:00Z",
};
const session = { user: { id: "actor" }, session: { id: "session" } };
function runtime(overrides = {}) {
  const queryClient = new TestQueryClient({ defaultOptions: { queries: { retry: false } } });
  const calls = [];
  return {
    queryClient,
    calls,
    input: {
      queryClient,
      pageId: "page",
      getSession: async () => session,
      getWorkspaces: async () => {
        calls.push("workspaces");
        return [];
      },
      isOnline: () => true,
      apiFetch: async (path) => {
        calls.push(path);
        return { page, viewerType: "member", databaseIds: ["host"] };
      },
      ...overrides,
    },
  };
}
test("page access resolves viewer roles and exposes member detail for storage hydration only", async () => {
  for (const viewerType of ["member", "guest", "public", null]) {
    const r = runtime({ apiFetch: async () => ({ page, viewerType, databaseIds: ["host"] }) });
    try {
      const decision = await decidePageShareAccess(r.input);
      assert.equal(decision.type, viewerType === "member" ? "app" : (viewerType ?? "onboarding"));
      assert.equal(Boolean(decision.memberDetail), viewerType === "member");
      if (viewerType === "member") {
        assert.equal(decision.memberDetail.page.id, "page");
        assert.deepEqual(decision.memberDetail.databaseIds, ["host"]);
      }
      assert.deepEqual(r.calls, viewerType === null ? ["workspaces"] : []);
    } finally {
      r.queryClient.clear();
    }
  }
});
test("offline access trusts only cached member detail without network or hydration", async () => {
  for (const viewerType of ["member", "guest", "public"]) {
    const r = runtime({ isOnline: () => false });
    try {
      cachePageDetail(r.queryClient, { page, viewerType, accessLevel: "view", databaseIds: [] });
      const decision = await decidePageShareAccess(r.input);
      assert.equal(decision.type, viewerType === "member" ? "app" : "unavailable");
      assert.equal(decision.memberDetail, undefined);
      assert.deepEqual(r.calls, []);
    } finally {
      r.queryClient.clear();
    }
  }
});
test("workspace mismatch reaches the workspace gate while other page read errors propagate", async () => {
  const error = new Error("choose workspace");
  error.name = "ActiveWorkspaceMismatchError";
  const r = runtime({
    apiFetch: async () => {
      throw error;
    },
  });
  try {
    assert.deepEqual(await decidePageShareAccess(r.input), { type: "app" });
    error.name = "Error";
    await assert.rejects(decidePageShareAccess(r.input), error);
  } finally {
    r.queryClient.clear();
  }
});
test("anonymous page access preserves the second session read and publication decision", async () => {
  let sessions = 0;
  const r = runtime({
    getSession: async () => {
      sessions++;
      return { user: null, session: null };
    },
    apiFetch: async (path) => {
      assert.equal(path, "/pages/page/published");
      return { published: true };
    },
  });
  try {
    assert.deepEqual(await decidePageShareAccess(r.input), { type: "public" });
    assert.equal(sessions, 2);
    assert.deepEqual(r.calls, []);
  } finally {
    r.queryClient.clear();
  }
});
