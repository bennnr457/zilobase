import assert from "node:assert/strict";
import { test } from "node:test";
import { TestQueryClient } from "../data/testing";
import { sharedClient } from "../data/client";
import { chatRunDebugOptions } from "./queries";
import type { ChatRunDebug } from "./debug";

test("debug queries reject late raw payloads when the client identity changes", async () => {
  const queryClient = new TestQueryClient();
  let release!: (data: ChatRunDebug) => void;
  const delivery = new Promise<ChatRunDebug>((resolve) => {
    release = resolve;
  });
  const options = chatRunDebugOptions(
    { queryClient, apiFetch: async <T>() => (await delivery) as T },
    "workspace",
    "run",
  );
  const result = queryClient.fetchQuery(options);
  sharedClient(queryClient).clear();
  release({
    runId: "run",
    status: "completed",
    model: null,
    expiresAt: null,
    available: true,
    events: [],
    omitted: 0,
  });
  await assert.rejects(result, /expired identity/);
  assert.equal(queryClient.getQueryData(options.queryKey), undefined);
  queryClient.clear();
});
