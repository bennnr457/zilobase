import { afterEach, expect, test, vi } from "vitest";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { createAiDiagnostics } from "./diagnostics";

afterEach(() => vi.restoreAllMocks());
test("diagnostics identify the selected database route without logging credentials or content", () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const env = {
    ZILOBASE_RUNTIME_KIND: "worker",
  };
  runWithRuntimePorts(
    {
      env: { require: () => "postgres://private:password@hyperdrive/db", get: () => "hyperdrive" },
    } as any,
    () => {
      const diagnostics = createAiDiagnostics(env, { runId: "run" });
      diagnostics.event("tool", {
        tool: "read_page",
        prompt: "private document",
        sourceTitle: "secret",
        headers: { cookie: "credential" },
      } as any);
    },
  );
  const value = JSON.parse(log.mock.calls[0]![0]);
  expect(value).toMatchObject({
    event: "ai.diagnostic",
    database: "hyperdrive",
    runId: "run",
    tool: "read_page",
  });
  expect(JSON.stringify(log.mock.calls)).not.toMatch(
    /password|postgres:|private document|sourceTitle|credential/,
  );
  createAiDiagnostics({ ...env, DATABASE_URL: "postgres://direct/db" }).event("tool");
  expect(JSON.parse(log.mock.calls[1]![0]).database).toBe("direct");
});

test("measurements preserve results and errors, and logging failures never break work", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const diagnostics = createAiDiagnostics({ DATABASE_URL: "postgres://local/db" });
  await expect(diagnostics.measure("model", async () => 42)).resolves.toBe(42);
  const failure = new Error("private provider error");
  await expect(
    diagnostics.measure("model", async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(JSON.stringify(log.mock.calls)).not.toContain(failure.message);
  log.mockImplementation(() => {
    throw new Error("log export unavailable");
  });
  await expect(diagnostics.measure("model", async () => "ok")).resolves.toBe("ok");
});

test("quiet timing summaries retain fast operations and remain available after the log cap", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const diagnostics = createAiDiagnostics({ DATABASE_URL: "postgres://local/db" });
  await diagnostics.measureQuiet("control", async () => {});
  diagnostics.databaseTiming("control")("db_connect", 10);
  expect(log).not.toHaveBeenCalled();
  for (let i = 0; i < 400; i++) diagnostics.event("tool");
  diagnostics.summary();
  const events = log.mock.calls.map((call) => JSON.parse(call[0]));
  expect(events.filter((event) => event.phase === "event")).toHaveLength(256);
  expect(events).toContainEqual(
    expect.objectContaining({
      stage: "control.db_connect",
      phase: "summary",
      count: 1,
      totalMs: 10,
    }),
  );
});

test("diagnostics can be disabled", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const diagnostics = createAiDiagnostics({ AI_DIAGNOSTICS_ENABLED: "false" });
  await diagnostics.measure("tool", async () => 1);
  diagnostics.summary();
  expect(log).not.toHaveBeenCalled();
});
