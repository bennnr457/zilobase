import { describe, expect, it } from "vitest";
import {
  getQueueRedisUrl,
  NODE_BACKGROUND_QUEUE_NAMES,
  selectedNodeBackgroundLanes,
  nodeSearchDependenciesReady,
} from "./queue-runtime";
import { createNodeJobs } from "./jobs";

describe("dedicated Node queues", () => {
  it("requires dedicated queue Redis even when realtime Redis is configured", () => {
    expect(() => getQueueRedisUrl({ REALTIME_REDIS_URL: "redis://localhost:6379" })).toThrow(
      "QUEUE_REDIS_URL",
    );
    expect(() => getQueueRedisUrl({ QUEUE_REDIS_URL: "https://localhost" })).toThrow();
    expect(() =>
      getQueueRedisUrl({
        QUEUE_REDIS_URL: "redis://localhost:6379/1",
        REALTIME_REDIS_URL: "redis://localhost:6379/0",
      }),
    ).toThrow();
    expect(() =>
      getQueueRedisUrl({
        QUEUE_REDIS_URL: "redis://localhost:6379",
        REALTIME_REDIS_URL: "redis://127.0.0.1:6379",
      }),
    ).toThrow();
    expect(
      getQueueRedisUrl({
        QUEUE_REDIS_URL: "redis://localhost:6380",
        REALTIME_REDIS_URL: "redis://localhost:6379",
      }),
    ).toBe("redis://localhost:6380");
  });
  it("defines independent lane queues", () => {
    expect(NODE_BACKGROUND_QUEUE_NAMES).toEqual({
      fast: "background-fast",
      ai: "background-ai",
      search: "background-search",
      automation: "automation-runs",
      calendar: "calendar-jobs",
    });
  });
  it("rejects dispatch after the queue runtime is detached", async () => {
    await expect(createNodeJobs(() => null).dispatch([])).rejects.toThrow(
      "BACKGROUND_QUEUE_NOT_STARTED",
    );
  });
});

it("validates dedicated lane selection while leaving all producer queues available", () => {
  expect(selectedNodeBackgroundLanes({})).toEqual(Object.keys(NODE_BACKGROUND_QUEUE_NAMES));
  expect(selectedNodeBackgroundLanes({ ZILOBASE_BACKGROUND_LANES: "search" })).toEqual(["search"]);
  expect(selectedNodeBackgroundLanes({ ZILOBASE_BACKGROUND_LANES: "search,fast" })).toEqual([
    "search",
    "fast",
  ]);
  for (const raw of ["unknown", "search,search", "search,", false])
    expect(() => selectedNodeBackgroundLanes({ ZILOBASE_BACKGROUND_LANES: raw })).toThrow(
      "ZILOBASE_BACKGROUND_LANES_INVALID",
    );
  expect(Object.keys(NODE_BACKGROUND_QUEUE_NAMES)).toHaveLength(5);
});
it("requires credentials only when deployment search is enabled", () => {
  expect(nodeSearchDependenciesReady({})).toBe(true);
  expect(nodeSearchDependenciesReady({ SEARCH_EMBEDDINGS_ENABLED: "true" })).toBe(false);
  expect(
    nodeSearchDependenciesReady({ SEARCH_EMBEDDINGS_ENABLED: "true", GEMINI_API_KEY: " " }),
  ).toBe(false);
  expect(
    nodeSearchDependenciesReady({ SEARCH_EMBEDDINGS_ENABLED: "true", GEMINI_API_KEY: "fixture" }),
  ).toBe(true);
});
