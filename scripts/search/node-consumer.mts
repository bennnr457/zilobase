// A real consumer process. The parent deliberately SIGKILLs it at provider/checkpoint boundaries.
import assert from "node:assert/strict";
import { createNodeQueueRuntime } from "@zilobase/runtime-adapter/node";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { runWithDbEnv } from "../../apps/server/src/infrastructure/database";
import {
  BACKGROUND_LANE_POLICY,
  decodeBackgroundTaskV2,
} from "../../apps/server/src/infrastructure/background/task-v2";
import { backgroundTaskLane } from "../../apps/server/src/infrastructure/background/contracts";
import {
  deliverBackgroundTask,
  recordBackgroundExhaustion,
} from "../../apps/server/src/app/background/runtime-delivery";
import { publishBackgroundDispatches } from "../../apps/server/src/infrastructure/background/publication";
assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/zilobase_background_verify");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
const env = process.env;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const request = new Request(input, init);
  return new URL(request.url).hostname === "generativelanguage.googleapis.com"
    ? originalFetch(`${env.SEARCH_FIXTURE_PROVIDER}/embed`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        duplex: "half",
        signal: request.signal,
      })
    : originalFetch(input, init);
};
let runtime;
const scoped = (work) =>
  runWithRuntimePorts(
    {
      jobs: { dispatch: (tasks) => runtime.dispatch(tasks) },
      fanout: { publish: async () => {}, subscribe: async () => () => {} },
    },
    () => runWithDbEnv(env, work),
  );
runtime = createNodeQueueRuntime(
  { ...env, ZILOBASE_PROCESS_ROLE: "worker", ZILOBASE_BACKGROUND_LANES: "search" },
  {
    validate: (body) => decodeBackgroundTaskV2(body, env.ZILOBASE_CELL_ID!),
    lane: (task) => backgroundTaskLane(task.kind),
    policy: BACKGROUND_LANE_POLICY,
    deliver: (task, lane, owner) => scoped(() => deliverBackgroundTask(env, task, lane, owner)),
    exhausted: (task, lane) => scoped(() => recordBackgroundExhaustion(env, task, lane)),
    maintain: () => scoped(() => publishBackgroundDispatches(env)),
  },
);
await runtime.start();
process.send?.({ event: "ready" });

process.on("message", async (message) => {
  if (message === "stop") {
    await runtime.stop();
    process.exit(0);
  }
});
