import type { BackgroundLane } from "@zilobase/runtime-ports";

export const CLOUDFLARE_BACKGROUND_QUEUE_BINDINGS = {
  fast: { binding: "BACKGROUND_FAST", queue: "zilobase-background-fast" },
  automation: { binding: "AUTOMATION_RUNS", queue: "zilobase-automation-runs" },
  calendar: { binding: "CALENDAR_JOBS", queue: "zilobase-calendar-jobs" },
  ai: { binding: "AI_RUNS", queue: "zilobase-ai-runs" },
  search: { binding: "SEARCH_INDEXING", queue: "zilobase-search-indexing" },
} as const satisfies Record<BackgroundLane, { binding: string; queue: string }>;
