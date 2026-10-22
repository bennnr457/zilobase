import { CLOUDFLARE_BACKGROUND_QUEUE_BINDINGS } from "../background-queues";
import type { BackgroundLane, BackgroundTask, Jobs } from "@zilobase/runtime-ports";
import { backgroundTaskLane } from "@zilobase/server/adapter-api";
import type { WorkerEnvBindings } from "./bindings";

type BackgroundQueue = {
  send(message: BackgroundTask, options?: { delaySeconds?: number }): Promise<void>;
};

export type WorkerJobsEnv = WorkerEnvBindings & {
  AI_RUNS?: BackgroundQueue;
  SEARCH_INDEXING?: BackgroundQueue;
  BACKGROUND_FAST?: BackgroundQueue;
  AUTOMATION_RUNS?: BackgroundQueue;
  CALENDAR_JOBS?: BackgroundQueue;
};

export function workerSearchDependenciesReady(env: WorkerJobsEnv) {
  return (
    env.SEARCH_EMBEDDINGS_ENABLED !== "true" ||
    (!!env.SEARCH_INDEXING && typeof env.GEMINI_API_KEY === "string" && !!env.GEMINI_API_KEY.trim())
  );
}

export function createWorkerJobs(env: WorkerJobsEnv): Jobs {
  return {
    async dispatch(tasks) {
      await Promise.all(
        tasks.map(async (task) => {
          const lane = backgroundTaskLane(task.kind as never);
          const queue = queueForLane(env, lane);
          if (!queue) throw new Error(`BACKGROUND_${lane.toUpperCase()}_QUEUE_REQUIRED`);
          const delaySeconds = Math.max(
            0,
            Math.min(43_200, Math.ceil((Date.parse(task.availableAt) - Date.now()) / 1_000)),
          );
          if (delaySeconds > 0) await queue.send(task, { delaySeconds });
          else await queue.send(task);
        }),
      );
    },
  };
}

function queueForLane(env: WorkerJobsEnv, lane: BackgroundLane) {
  return env[CLOUDFLARE_BACKGROUND_QUEUE_BINDINGS[lane].binding];
}
