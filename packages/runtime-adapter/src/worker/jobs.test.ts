import { describe, expect, it, vi } from "vitest";
import { createWorkerJobs, workerSearchDependenciesReady } from "./jobs";

describe("worker Jobs port", () => {
  it("routes tasks by lane and applies queue delay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const send = vi.fn(async () => undefined);
    const jobs = createWorkerJobs({ BACKGROUND_FAST: { send } });

    await jobs.dispatch([
      {
        availableAt: "2026-01-01T00:00:10.000Z",
        cellId: "default",
        kind: "notification.publish",
        resourceId: "job-1",
        taskId: "00000000-0000-4000-8000-000000000001",
        version: 2,
      },
    ]);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "job-1" }), {
      delaySeconds: 10,
    });
    vi.useRealTimers();
  });
});

it("isolates AI generation and rejects missing AI producer bindings", async () => {
  const send = vi.fn(async () => {});
  const task = {
    availableAt: new Date().toISOString(),
    cellId: "default",
    kind: "ai.generate",
    resourceId: "run",
    taskId: "00000000-0000-4000-8000-000000000001",
    version: 2,
  };
  await createWorkerJobs({ AI_RUNS: { send } }).dispatch([task]);
  expect(send).toHaveBeenCalledWith(task);
  await expect(createWorkerJobs({}).dispatch([task])).rejects.toThrow(
    "BACKGROUND_AI_QUEUE_REQUIRED",
  );
});

it.each(["search.page_index", "search.workspace_scan", "search.invalidate"])(
  "isolates %s in the search queue",
  async (kind) => {
    const send = vi.fn(async () => {});
    const task = {
      availableAt: new Date(0).toISOString(),
      cellId: "default",
      kind,
      resourceId: "identifier",
      taskId: "00000000-0000-4000-8000-000000000001",
      version: 2,
    };
    await createWorkerJobs({ SEARCH_INDEXING: { send } }).dispatch([task]);
    expect(send).toHaveBeenCalledWith(task);
    await expect(createWorkerJobs({}).dispatch([task])).rejects.toThrow(
      "BACKGROUND_SEARCH_QUEUE_REQUIRED",
    );
    expect(JSON.stringify(task)).not.toMatch(/markdown|embedding|content/);
  },
);

it("makes search readiness conditional on both the queue binding and server credential", () => {
  expect(workerSearchDependenciesReady({})).toBe(true);
  expect(workerSearchDependenciesReady({ SEARCH_EMBEDDINGS_ENABLED: "true" })).toBe(false);
  expect(
    workerSearchDependenciesReady({
      SEARCH_EMBEDDINGS_ENABLED: "true",
      SEARCH_INDEXING: { send: async () => {} },
    }),
  ).toBe(false);
  expect(
    workerSearchDependenciesReady({
      SEARCH_EMBEDDINGS_ENABLED: "true",
      GEMINI_API_KEY: "fixture",
      SEARCH_INDEXING: { send: async () => {} },
    }),
  ).toBe(true);
});
