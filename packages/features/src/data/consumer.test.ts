import assert from "node:assert/strict";
import test from "node:test";
import { createZilobaseQueryClient } from "../shared/query-client";
import type { ApiFetcher } from "../shared/api-fetcher";
import { installSharedClient } from "./client";
import { pageQueryOptions } from "../pages/queries";
import { resolvePageReference, stageAuthorizedPages } from "../pages/cache";
import { hydratePageReadSnapshots, subscribePageReadSnapshots } from "../pages/read-cache";
import type { PageReadSnapshot } from "../pages/read-cache";

const page = {
  id: "page",
  workspaceId: "workspace",
  name: "Original",
  type: "pageblock",
  url: "#",
  createdAt: "2026-10-14T00:00:00.001Z",
  updatedAt: "2026-10-14T00:00:00.001Z",
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function runtime() {
  const queryClient = createZilobaseQueryClient();
  let account = "first";
  const cache = installSharedClient(queryClient, () => ({
    deployment: "https://consumer.test",
    viewer: { kind: "account", accountId: account, actorId: account, sessionId: account },
  }));
  return {
    queryClient,
    cache,
    changeAccount: () => {
      account = "second";
    },
    dispose: () => {
      cache.clear();
      queryClient.clear();
    },
  };
}

test("consumer read, queued edits, rollback and acknowledgement share canonical entities", async () => {
  const app = runtime();
  try {
    const apiFetch = (async () => ({ page, accessLevel: "full" })) as ApiFetcher;
    const detail = await app.queryClient.fetchQuery(pageQueryOptions(apiFetch, page.id));
    assert(detail);
    const owner = app.cache.get(detail.page.cacheId)!;
    await owner.session.ready();
    const failed = Promise.withResolvers<void>();
    const confirmed = Promise.withResolvers<void>();
    const edit = (name: string, receipt: Promise<void>) =>
      owner.session.commands.run(
        owner.pages,
        page.id,
        (draft) => {
          draft.name = name;
        },
        async () => receipt,
      );
    const first = edit("Rejected", failed.promise);
    const rejection = assert.rejects(first, /server rejected/);
    const second = edit("Accepted", confirmed.promise);
    await tick();
    assert.equal(resolvePageReference(app.queryClient, detail.page)?.name, "Rejected");
    failed.reject(new Error("server rejected"));
    await rejection;
    await tick();
    assert.equal(resolvePageReference(app.queryClient, detail.page)?.name, "Accepted");
    stageAuthorizedPages(app.queryClient, app.cache.capture(), page.workspaceId, [
      { ...page, name: "Accepted", updatedAt: "2026-10-14T00:00:00.002Z" },
    ]);
    confirmed.resolve();
    await second;
    assert.equal(resolvePageReference(app.queryClient, detail.page)?.name, "Accepted");
    assert.equal(app.queryClient.getQueryData(["page", page.id]), detail);
  } finally {
    app.dispose();
  }
});

test("consumer account transition rejects an in-flight API receipt and clears old entities", async () => {
  const app = runtime();
  try {
    const receipt = Promise.withResolvers<{ page: typeof page }>();
    const request = app.queryClient.fetchQuery({
      ...pageQueryOptions((async () => receipt.promise) as ApiFetcher, page.id),
      retry: false,
    });
    const rejected = assert.rejects(request, /expired/i);
    await tick();
    app.changeAccount();
    receipt.resolve({ page });
    await rejected;
    assert.equal(app.cache.all().length, 0);
  } finally {
    app.dispose();
  }
});

test("consumer restart restores eligible reads without persisting entity references or previews", async () => {
  const app = runtime();
  const stored: PageReadSnapshot[] = [];
  const stop = subscribePageReadSnapshots(
    app.queryClient,
    "first",
    (row) => stored.push(row),
    () => {},
  );
  try {
    await app.queryClient.fetchQuery({
      queryKey: ["meetings", "list", "workspace"],
      queryFn: async () => ({ meetings: [{ id: "meeting" }] }),
    });
    await app.queryClient.fetchQuery(
      pageQueryOptions((async () => ({ page })) as ApiFetcher, page.id),
    );
    app.queryClient.setQueryData(["user-settings"], { localPreview: true });
    assert.equal(stored.length, 1);
    const restored = runtime();
    try {
      hydratePageReadSnapshots(restored.queryClient, "first", stored);
      assert.deepEqual(restored.queryClient.getQueryData(stored[0]!.queryKey), stored[0]!.data);
      assert.equal(restored.queryClient.getQueryState(stored[0]!.queryKey)?.isInvalidated, true);
      assert.equal(restored.queryClient.getQueryData(["page", page.id]), undefined);
      assert.equal(restored.queryClient.getQueryData(["user-settings"]), undefined);
      assert.equal(restored.cache.all().length, 0);
    } finally {
      restored.dispose();
    }
  } finally {
    stop();
    app.dispose();
  }
});
