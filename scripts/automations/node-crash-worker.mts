// Killed by the parent after a real automation consumer reaches its provider.
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

const env = process.env;
assert.equal(new URL(env.DATABASE_URL!).pathname, "/zilobase_background_verify");
assert.equal(new URL(env.DATABASE_URL!).hostname, "127.0.0.1");
globalThis.fetch = async (input) => {
  assert.equal(new URL(String(input)).hostname, "dns.google");
  return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
};
let runtime;
const scoped = (work) =>
  runWithRuntimePorts(
    {
      jobs: { dispatch: (tasks) => runtime.dispatch(tasks) },
      fanout: { publish: async () => {}, subscribe: async () => () => {} },
      outbound: {
        fetchWebhook: async (input) => {
          assert.equal(new URL(input.url).hostname, "receiver.automation.test");
          process.send?.({
            event: "provider-entered",
            deliveryId: input.headers["x-zilobase-delivery-id"],
          });
          return new Promise<Response>(() => {});
        },
      },
    },
    () => runWithDbEnv(env, work),
  );
runtime = createNodeQueueRuntime(env, {
  validate: (body) => decodeBackgroundTaskV2(body, env.ZILOBASE_CELL_ID!),
  lane: (task) => backgroundTaskLane(task.kind),
  policy: BACKGROUND_LANE_POLICY,
  deliver: (task, lane, owner) => scoped(() => deliverBackgroundTask(env, task, lane, owner)),
  exhausted: (task, lane) => scoped(() => recordBackgroundExhaustion(env, task, lane)),
  maintain: () => scoped(() => publishBackgroundDispatches(env)),
});
await runtime.start();
