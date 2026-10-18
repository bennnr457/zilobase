// Production API/queue/cron code with a local fault-control binding. No processor
// aliases, authentication bypasses, or test routes are installed in the app.
import { createApp } from "@zilobase/server/adapter-api";
import { createWorker, createBackgroundWorker } from "@zilobase/runtime-adapter/worker";
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
      policy: {
        compression: false,
        registration: "bootstrap",
        webhookHttpDomains: new Set(),
        workspaceSelection: "pinned",
      },
    }),
});
const background = createBackgroundWorker({
  reportError: (_env, error, context) => {
    const failure = error as Error & { cause?: { message?: string; code?: string } };
    console.error(
      JSON.stringify({
        event: "fixture.worker_failure",
        ...context,
        message: failure.message?.split("\nparams:")[0]?.slice(0, 300),
        cause: failure.cause?.message?.slice(0, 300),
        code: failure.cause?.code,
      }),
    );
  },
});
let currentEnv: Record<string, unknown> | undefined;
async function configuration(env) {
  const state = await (await env.AUTOMATION_FIXTURE_CONTROL.fetch("http://fixture/state")).json();
  currentEnv ??= {};
  Object.assign(currentEnv, env, state.overrides);
  for (const name of ["BACKGROUND_FAST", "AUTOMATION_RUNS", "CALENDAR_JOBS"]) {
    const queue = env[name];
    currentEnv[name] = {
      async send(...args) {
        const latest = await (
          await env.AUTOMATION_FIXTURE_CONTROL.fetch("http://fixture/state")
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
    await env.AUTOMATION_FIXTURE_CONTROL.fetch("http://fixture/consume");
    return background.queue(batch, await configuration(env));
  },
  async scheduled(controller, env) {
    return background.scheduled(controller, await configuration(env));
  },
};
