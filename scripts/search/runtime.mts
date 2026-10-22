import { createServer } from "node:http";
import { Readable } from "node:stream";
import { fork, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createCollaborationHocuspocus } from "../../apps/server/src/services/collaboration/runtime/hocuspocus";
import { replacePageContentInHocuspocus } from "../../apps/server/src/services/collaboration/mutations/document-mutations";
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
import { publishBackgroundDispatches } from "../../apps/server/src/infrastructure/background/publication";
import { maintainSearchIndex } from "../../apps/server/src/services/search/maintenance";

export async function startSearchRuntime(kind, env, providerOrigin) {
  if (kind === "worker")
    return (await import("./worker-runtime.mts")).startSearchWorker(env, providerOrigin);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const request = new Request(input, init);
    return new URL(request.url).hostname === "generativelanguage.googleapis.com"
      ? originalFetch(`${providerOrigin}/embed`, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          duplex: "half",
          signal: request.signal,
        })
      : originalFetch(input, init);
  };
  let producer, consumer;
  const collaboration = createCollaborationHocuspocus(env);
  const runtimeEnv = createRuntimeEnv(env);
  const ports = {
    env: runtimeEnv,
    urls: createUrlResolver(runtimeEnv),
    jobs: { dispatch: (tasks) => producer.dispatch(tasks) },
    fanout: {
      publish: async (channel, payload) => {
        if (channel.startsWith("page:"))
          await replacePageContentInHocuspocus(collaboration, payload);
      },
      subscribe: async () => () => {},
    },
    telemetry: createNodeTelemetry(),
    readiness: { background: () => producer.readiness(), realtime: () => true },
  };
  const scoped = (work) => runWithRuntimePorts(ports, () => runWithDbEnv(env, work));
  producer = createNodeQueueRuntime(
    { ...env, ZILOBASE_PROCESS_ROLE: "api" },
    {
      validate: (body) => decodeBackgroundTaskV2(body, env.ZILOBASE_CELL_ID),
      lane: (task) => backgroundTaskLane(task.kind),
      policy: BACKGROUND_LANE_POLICY,
      maintain: () => scoped(() => publishBackgroundDispatches(env)),
      deliver: async () => {
        throw new Error("API must never consume");
      },
      exhausted: async () => {},
    },
  );
  const app = createApp({
    ports,
    policy: { registration: "bootstrap", compression: false, workspaceSelection: "pinned" },
  });
  const server = createServer(async (incoming, outgoing) => {
    try {
      const response = await app.fetch(
        new Request(`http://127.0.0.1${incoming.url}`, {
          method: incoming.method,
          headers: incoming.headers,
          ...(!["GET", "HEAD"].includes(incoming.method!)
            ? { body: Readable.toWeb(incoming), duplex: "half" }
            : {}),
        }),
        env,
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      outgoing.writeHead(500);
      outgoing.end(error instanceof Error ? error.name : "FixtureError");
    }
  });
  const pause = async (crash = false) => {
    if (!consumer) return;
    const active = consumer;
    consumer = undefined;
    const exited = new Promise((resolve) => active.once("exit", resolve));
    if (crash) active.kill("SIGKILL");
    else active.send("stop");
    await exited;
  };
  const resume = async () => {
    if (consumer) return;
    consumer = fork(fileURLToPath(new URL("./node-consumer.mts", import.meta.url)), [], {
      execArgv: ["--import", "tsx"],
      env: { ...process.env, ...env, SEARCH_FIXTURE_PROVIDER: providerOrigin },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    consumer.stderr.pipe(process.stderr);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Search consumer did not become ready")),
        45000,
      );
      consumer.once("message", () => {
        clearTimeout(timer);
        resolve();
      });
      consumer.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Search consumer exited ${code}`));
      });
    });
  };
  try {
    await producer.start();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    env.BETTER_AUTH_URL = origin;
    env.CLIENT_URL = origin;
    await resume();
    return {
      origin,
      pause: () => pause(),
      crash: () => pause(true),
      resume,
      deliver: (task) => producer.dispatch([task]),
      publish: () => scoped(() => publishBackgroundDispatches(env)),
      maintenance: () =>
        scoped(async () => {
          await maintainSearchIndex(env);
          return publishBackgroundDispatches(env);
        }),
      updateEnv: async (patch) => Object.assign(env, patch),
      setQueueAvailable: async (available) => {
        const broker = process.env.ZILOBASE_QUEUE_VERIFY_CONTAINER!;
        if (!broker.startsWith("zilobase-background-test-") || !broker.endsWith("-queue"))
          throw new Error("Non-fixture broker rejected");
        await promisify(execFile)("docker", available ? ["unpause", broker] : ["pause", broker]);
      },
      close: async () => {
        await pause();
        await new Promise<void>((resolve) => {
          collaboration.configuration.extensions.push({
            afterUnloadDocument({ instance }) {
              if (instance.getDocumentsCount() === 0) resolve();
            },
          });
          if (collaboration.getDocumentsCount() === 0) resolve();
          collaboration.closeConnections();
          collaboration.flushPendingStores();
        });
        await collaboration.hooks("onDestroy", { instance: collaboration });
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
