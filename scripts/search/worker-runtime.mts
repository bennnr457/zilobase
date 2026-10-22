import { CLOUDFLARE_BACKGROUND_QUEUE_BINDINGS } from "@zilobase/runtime-adapter/operations/cloudflare-queues";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { runWithDbEnv, db } from "../../apps/server/src/infrastructure/database";
const require = createRequire(import.meta.url);
export async function startSearchWorker(env, providerOrigin) {
  const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
  const directory = await mkdtemp(`${tmpdir()}/zilobase-search-worker-`);
  let worker;
  const state = { overrides: {}, queueAvailable: true };
  let paused = false;
  const waiting = new Set<() => void>();
  try {
    await promisify(execFile)(
      "node_modules/.bin/wrangler",
      [
        "deploy",
        "--dry-run",
        "--config",
        "scripts/search/worker-fixture.jsonc",
        "--outdir",
        directory,
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    const inventory = Object.values(CLOUDFLARE_BACKGROUND_QUEUE_BINDINGS);
    const options = convertV4MiniflareOptions({
      workers: [
        {
          name: "search-fixture",
          modules: true,
          script: await readFile(`${directory}/worker-fixture.js`, "utf8"),
          compatibilityDate: "2026-08-21",
          compatibilityFlags: ["nodejs_compat"],
          bindings: { ...env, ZILOBASE_RUNTIME_KIND: "worker" },
          queueProducers: Object.fromEntries(
            inventory.flatMap(({ binding, queue }) => [
              [binding, queue],
              [queue, queue],
              [`${queue}-dlq`, `${queue}-dlq`],
            ]),
          ),
          queueConsumers: Object.fromEntries(
            inventory.flatMap(({ queue }) => [
              [
                queue,
                {
                  maxBatchSize: 1,
                  maxBatchTimeout: 0,
                  maxRetries: 5,
                  deadLetterQueue: `${queue}-dlq`,
                },
              ],
              [`${queue}-dlq`, { maxBatchSize: 1, maxBatchTimeout: 0 }],
            ]),
          ),
          durableObjects: {
            DATABASE_COLLABORATION: { className: "DatabaseCollaborationRoom", useSQLite: true },
            NAVIGATION_NOTIFICATION_ROOM: {
              className: "NavigationNotificationRoom",
              useSQLite: true,
            },
            CALENDAR_NOTIFICATION_ROOM: {
              className: "CalendarNotificationRoom",
              useSQLite: true,
            },
            PAGE_COLLABORATION: { className: "PageCollaborationRoom", useSQLite: true },
            MEETING_COLLABORATION: { className: "MeetingCollaborationRoom", useSQLite: true },
          },
          serviceBindings: {
            SEARCH_FIXTURE_CONTROL: async (request) => {
              if (new URL(request.url).pathname === "/consume" && paused)
                await new Promise<void>((resolve) => waiting.add(resolve));
              return Response.json(state);
            },
          },
          outboundService: (request) => {
            if (new URL(request.url).hostname !== "generativelanguage.googleapis.com")
              throw new Error("Unexpected external provider request");
            return fetch(`${providerOrigin}/embed`, {
              method: request.method,
              headers: request.headers,
              body: request.body,
              duplex: "half",
              signal: request.signal,
            });
          },
        },
      ],
    });
    worker = new Miniflare(options);
    const origin = (await worker.ready).origin;
    state.overrides = { BETTER_AUTH_URL: origin, CLIENT_URL: origin };
    const resume = async () => {
      paused = false;
      for (const release of waiting) release();
      waiting.clear();
    };
    return {
      origin,
      interrupt: async () => {
        await worker.setOptions({
          ...options,
          workers: options.workers.map((w) => ({
            ...w,
            config: {
              ...w.config,
              manifest: {
                ...w.config.manifest,
                modules: Object.fromEntries(
                  Object.entries(w.config.manifest.modules).map(([name, module]) => [
                    name,
                    {
                      ...module,
                      contents: module.contents + `\n// interruption ${crypto.randomUUID()}`,
                    },
                  ]),
                ),
              },
            },
          })),
          port: Number(new URL(origin).port),
        });
        await worker.ready;
      },
      pause: async () => {
        paused = true;
      },
      resume,
      deliver: async (task) =>
        (await worker.getQueueProducer("zilobase-search-indexing")).send(task),
      updateEnv: async (patch) => Object.assign(state.overrides, patch),
      setQueueAvailable: async (available) => {
        state.queueAvailable = available;
      },
      publish: async () => {
        await (await worker.getWorker()).scheduled({ cron: "* * * * *" });
      },
      maintenance: async () => {
        // Accelerate cron eligibility, then execute the production scheduled handler.
        await runWithDbEnv(
          env,
          async () =>
            await db.execute(
              sql`update background_maintenance_task set next_run_at=now() where task_key='search.index'`,
            ),
        );
        await (await worker.getWorker()).scheduled({ cron: "* * * * *" });
      },
      close: async () => {
        await resume();
        await worker.dispose();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await worker?.dispose();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
