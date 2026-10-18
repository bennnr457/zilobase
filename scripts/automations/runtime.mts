import { createServer } from "node:http";
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile, fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { createApp } from "../../apps/server/src/app/index";
import { runWithDbEnv } from "../../apps/server/src/infrastructure/database";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { createNodeQueueRuntime, createNodeTelemetry } from "@zilobase/runtime-adapter/node";
import { createRuntimeEnv } from "@zilobase/runtime-adapter/env";
import { createUrlResolver } from "@zilobase/runtime-adapter/url-resolver";
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
import { runDueBackgroundMaintenance } from "../../apps/server/src/app/background/maintenance";

const require = createRequire(import.meta.url);
const queues = {
  fast: "zilobase-background-fast",
  automation: "zilobase-automation-runs",
  calendar: "zilobase-calendar-jobs",
};

export async function startRuntime(kind, env, providers) {
  if (kind === "worker") return startWorker(env, providers);
  const runtimeEnv = createRuntimeEnv(env);
  let producer;
  const ports = {
    env: runtimeEnv,
    urls: createUrlResolver(runtimeEnv),
    jobs: { dispatch: (tasks) => producer.dispatch(tasks) },
    outbound: {
      fetchWebhook: (input) =>
        providers.fetch(
          new Request(input.url, { method: "POST", headers: input.headers, body: input.body }),
        ),
    },
    fanout: { publish: async () => {}, subscribe: async () => () => {} },
    telemetry: createNodeTelemetry(),
    readiness: { background: () => producer.readiness(), realtime: () => true },
  };
  const scoped = (work) => runWithRuntimePorts(ports, () => runWithDbEnv(env, work));
  const owners = new Set();
  const callbacks = {
    validate: (body) => decodeBackgroundTaskV2(body, env.ZILOBASE_CELL_ID),
    lane: (task) => backgroundTaskLane(task.kind),
    policy: BACKGROUND_LANE_POLICY,
    maintain: () => scoped(() => publishBackgroundDispatches(env)),
    deliver: (body, lane, owner) => {
      owners.add(owner);
      return scoped(() => deliverBackgroundTask(env, body, lane, owner));
    },
    exhausted: (body, lane) => scoped(() => recordBackgroundExhaustion(env, body, lane)),
  };
  const queueEnv = { ...env, ZILOBASE_PROCESS_ROLE: "api" };
  producer = createNodeQueueRuntime(queueEnv, callbacks);
  let consumers = [];
  const resume = async () => {
    if (consumers.length) return;
    consumers = [0, 1].map(() =>
      createNodeQueueRuntime({ ...env, ZILOBASE_PROCESS_ROLE: "worker" }, callbacks),
    );
    await Promise.all(consumers.map((worker) => worker.start()));
  };
  const pause = async () => {
    await Promise.all(consumers.map((worker) => worker.stop()));
    consumers = [];
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const request = new Request(input, init);
    const host = new URL(request.url).hostname;
    return host === "slack.com" ||
      host === "cloudflare-dns.com" ||
      host === "dns.google" ||
      host.endsWith(".automation.test")
      ? providers.fetch(request)
      : originalFetch(input, init);
  };
  const app = createApp({ ports });
  const server = createServer(async (incoming, outgoing) => {
    try {
      const request = new Request(`http://127.0.0.1${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers,
        ...(!["GET", "HEAD"].includes(incoming.method!)
          ? { body: Readable.toWeb(incoming), duplex: "half" }
          : {}),
      });
      const response = await app.fetch(request, env);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      outgoing.writeHead(500);
      outgoing.end(String(error));
    }
  });
  try {
    await producer.start();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    env.BETTER_AUTH_URL = origin;
    env.CLIENT_URL = origin;
    await resume();
    return {
      origin,
      setQueueAvailable: async (available) => {
        const broker = process.env.ZILOBASE_QUEUE_VERIFY_CONTAINER!;
        if (!broker.startsWith("zilobase-background-test-") || !broker.endsWith("-queue"))
          throw new Error("Refusing non-fixture broker");
        await promisify(execFile)("docker", available ? ["unpause", broker] : ["pause", broker]);
        if (available) {
          const deadline = Date.now() + 20_000;
          while (!producer.readiness().producerReady) {
            if (Date.now() > deadline) throw new Error("Broker recovery timed out");
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      },
      owners,
      crashDuringWebhook: async () => {
        const child = fork(fileURLToPath(new URL("./node-crash-worker.mts", import.meta.url)), [], {
          execArgv: ["--import", "tsx"],
          env: { ...process.env, ...env, ZILOBASE_PROCESS_ROLE: "worker" },
          stdio: ["ignore", "ignore", "pipe", "ipc"],
        });
        child.stderr?.pipe(process.stderr);
        try {
          return await new Promise<{ deliveryId: string }>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error("Crash consumer did not reach provider")),
              20_000,
            );
            child.once("message", (message) => {
              clearTimeout(timeout);
              resolve(message as { deliveryId: string });
            });
            child.once("exit", (code) => {
              clearTimeout(timeout);
              reject(new Error(`Crash consumer exited early: ${code}`));
            });
          });
        } finally {
          if (child.exitCode === null && child.signalCode === null) {
            const exited = new Promise((resolve) => child.once("exit", resolve));
            child.kill("SIGKILL");
            await exited;
          }
        }
      },
      pause,
      resume,
      updateEnv: async (patch) => Object.assign(env, patch),
      publish: () => scoped(() => publishBackgroundDispatches(env)),
      maintenance: () =>
        scoped(() =>
          runDueBackgroundMaintenance({ env, workerId: `fixture:${crypto.randomUUID()}` }),
        ),
      deliver: (task) => producer.dispatch([task]),
      close: async () => {
        await pause();
        await producer.stop();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        globalThis.fetch = originalFetch;
      },
    };
  } catch (error) {
    await pause();
    await producer.stop();
    server.close();
    globalThis.fetch = originalFetch;
    throw error;
  }
}

async function startWorker(env, providers) {
  const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
  const dir = await mkdtemp(`${tmpdir()}/zilobase-automation-worker-`);
  let mf;
  try {
    await promisify(execFile)(
      "node_modules/.bin/wrangler",
      [
        "deploy",
        "--dry-run",
        "--config",
        "scripts/automations/worker-fixture.jsonc",
        "--outdir",
        dir,
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    const names = Object.values(queues);
    const bindingNames = ["BACKGROUND_FAST", "AUTOMATION_RUNS", "CALENDAR_JOBS"];
    const script = await readFile(`${dir}/worker-fixture.js`, "utf8");
    const state = { overrides: {}, queueAvailable: true };
    let paused = false;
    const waiting = new Set<() => void>();
    const base = {
      name: "automation-fixture",
      modules: true,
      script,
      compatibilityDate: "2026-08-21",
      compatibilityFlags: ["nodejs_compat"],
      bindings: { ...env, ZILOBASE_RUNTIME_KIND: "worker" },
      queueProducers: Object.fromEntries(
        names.flatMap((name, i) => [
          [bindingNames[i], name],
          [name, name],
          [`${name}-dlq`, `${name}-dlq`],
        ]),
      ),
      queueConsumers: Object.fromEntries(
        names.flatMap((name) => [
          [
            name,
            {
              maxBatchSize: 1,
              maxBatchTimeout: 0,
              maxRetries: name.includes("automation") ? 8 : 5,
              deadLetterQueue: `${name}-dlq`,
            },
          ],
          [`${name}-dlq`, { maxBatchSize: 1, maxBatchTimeout: 0 }],
        ]),
      ),
      durableObjects: {
        DATABASE_COLLABORATION: { className: "DatabaseCollaborationRoom", useSQLite: true },
        NAVIGATION_NOTIFICATION_ROOM: { className: "NavigationNotificationRoom", useSQLite: true },
        CALENDAR_NOTIFICATION_ROOM: { className: "CalendarNotificationRoom", useSQLite: true },
        PAGE_COLLABORATION: { className: "PageCollaborationRoom", useSQLite: true },
        MEETING_COLLABORATION: { className: "MeetingCollaborationRoom", useSQLite: true },
      },
      serviceBindings: {
        AUTOMATION_FIXTURE_CONTROL: async (request) => {
          if (new URL(request.url).pathname === "/consume" && paused)
            await new Promise<void>((resolve) => waiting.add(resolve));
          return Response.json(state);
        },
      },
      outboundService: (request) => providers.fetch(request),
    };
    const reservation = createServer();
    await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const options = () => ({ ...convertV4MiniflareOptions({ workers: [base] }), port });
    mf = new Miniflare(options());
    const origin = (await mf.ready).origin;
    state.overrides = { BETTER_AUTH_URL: origin, CLIENT_URL: origin };
    return {
      origin,
      updateEnv: async (patch) => {
        Object.assign(state.overrides, patch);
      },
      pause: async () => {
        paused = true;
      },
      resume: async () => {
        paused = false;
        for (const release of waiting) release();
        waiting.clear();
      },
      setQueueAvailable: async (available) => {
        state.queueAvailable = available;
      },
      publish: async () => {
        await (await mf.getWorker()).scheduled({ cron: "* * * * *" });
      },
      maintenance: async () => {
        await (await mf.getWorker()).scheduled({ cron: "* * * * *" });
      },
      deliver: async (task) =>
        (await mf.getQueueProducer(queues[backgroundTaskLane(task.kind)])).send(task),
      deadLetter: async (task) =>
        (await mf.getQueueProducer(`${queues[backgroundTaskLane(task.kind)]}-dlq`)).send(task),
      close: async () => {
        paused = false;
        for (const release of waiting) release();
        waiting.clear();
        await mf.dispose();
        await rm(dir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await mf?.dispose();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
