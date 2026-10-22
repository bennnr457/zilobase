// Production API/queue/cron composition; the control binding only injects failures.
import { createApp } from "@zilobase/server/adapter-api";
import { createWorker, createBackgroundWorker } from "@zilobase/runtime-adapter/worker";
import { CLOUDFLARE_BACKGROUND_QUEUE_BINDINGS } from "@zilobase/runtime-adapter/operations/cloudflare-queues";
export {
  DatabaseCollaborationRoom,
  MeetingCollaborationRoom,
  CalendarNotificationRoom,
  NavigationNotificationRoom,
  PageCollaborationRoom,
} from "@zilobase/runtime-adapter/worker";
const api = createWorker({
  loadApp: async (_env, ports) =>
    createApp({
      ports,
      policy: { compression: false, registration: "bootstrap", workspaceSelection: "pinned" },
    }),
});
const background = createBackgroundWorker({
  reportError: (_env, error, context) =>
    console.error(
      JSON.stringify({
        event: "search_fixture_worker_error",
        ...context,
        error: error instanceof Error ? error.name : "UnknownError",
      }),
    ),
});
let currentEnv;
async function configuration(env) {
  const state = await (await env.SEARCH_FIXTURE_CONTROL.fetch("http://fixture/state")).json();
  currentEnv ??= {};
  Object.assign(currentEnv, env, state.overrides);
  for (const { binding } of Object.values(CLOUDFLARE_BACKGROUND_QUEUE_BINDINGS)) {
    const queue = env[binding];
    currentEnv[binding] = {
      async send(...args) {
        const latest = await (
          await env.SEARCH_FIXTURE_CONTROL.fetch("http://fixture/state")
        ).json();
        if (!latest.queueAvailable) throw new Error("Fixture queue unavailable");
        return queue.send(...args);
      },
    };
  }
  return currentEnv;
}
export default {
  async fetch(request, env, ctx) {
    return api.fetch(request, await configuration(env), ctx);
  },
  async queue(batch, env) {
    await env.SEARCH_FIXTURE_CONTROL.fetch("http://fixture/consume");
    return background.queue(batch, await configuration(env));
  },
  async scheduled(controller, env) {
    return background.scheduled(controller, await configuration(env));
  },
};
