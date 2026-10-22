import { afterEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  page: vi.fn(),
  scan: vi.fn(),
  invalidate: vi.fn(),
  nudge: vi.fn(async () => undefined),
}));
vi.mock("./indexing", () => ({ indexSearchPage: fake.page }));
vi.mock("./maintenance", () => ({
  scanSearchWorkspace: fake.scan,
  processSearchInvalidation: fake.invalidate,
}));
vi.mock("./invalidation", () => ({ nudgeSearchIndexing: fake.nudge }));
import { processSearchTask } from "./background";
import { createBackgroundTask } from "../../infrastructure/background/contracts";
const env = { SEARCH_EMBEDDINGS_ENABLED: "true", ZILOBASE_CELL_ID: "test" };
afterEach(() => vi.resetAllMocks());

it.each([
  ["search.page_index", fake.page],
  ["search.workspace_scan", fake.scan],
  ["search.invalidate", fake.invalidate],
] as const)("%s wakes the next work only after its handler completes", async (kind, handler) => {
  const result = { outcome: "completed" } as const;
  handler.mockImplementation(async () => {
    expect(fake.nudge).not.toHaveBeenCalled();
    return result;
  });
  expect(
    await processSearchTask({
      env,
      task: createBackgroundTask({ env, kind, resourceId: "page" }),
      workerId: "test",
    }),
  ).toBe(result);
  expect(fake.nudge).toHaveBeenCalledExactlyOnceWith(env);
});

it("a terminal page failure still frees capacity for other pages", async () => {
  fake.page.mockResolvedValue({
    outcome: "terminal",
    errorCode: "SEARCH_PROVIDER_RESPONSE_INVALID",
  });
  await processSearchTask({
    env,
    task: createBackgroundTask({ env, kind: "search.page_index", resourceId: "page" }),
    workerId: "test",
  });
  expect(fake.nudge).toHaveBeenCalledOnce();
});

it("doesn't admit work for a disabled deployment or before a failed handler has recovered", async () => {
  const input = {
    env,
    task: createBackgroundTask({ env, kind: "search.page_index", resourceId: "page" }),
    workerId: "test",
  };
  await processSearchTask({ ...input, env: { ...env, SEARCH_EMBEDDINGS_ENABLED: "false" } });
  expect(fake.page).not.toHaveBeenCalled();
  fake.page.mockRejectedValue(new Error("Database unavailable"));
  await expect(processSearchTask(input)).rejects.toThrow("Database unavailable");
  expect(fake.nudge).not.toHaveBeenCalled();
});
