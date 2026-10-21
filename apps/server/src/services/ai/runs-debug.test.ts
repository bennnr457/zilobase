import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rows: [] as unknown[][],
  select: vi.fn(),
  workspace: vi.fn(),
  history: vi.fn(),
}));
vi.mock("../../infrastructure/database", () => ({
  db: {
    select: mocks.select,
    transaction: async (work: (tx: unknown) => unknown) => work({ select: mocks.select }),
  },
}));
vi.mock("./context", () => ({ authorizeChatWorkspace: mocks.workspace }));
vi.mock("./conversations", () => ({ assertHistoryAccess: mocks.history }));
import { readChatRunDebug } from "./runs";
import { sealRunInput } from "./run-input";
import { createAgentState, emptyChatContext } from "./agent-state";
import { recordDebugEvent } from "./debug";
import type { ServerOperationContext } from "../operations/context";
import { ServerOperationError } from "../operations/context";

const env = { AI_RUN_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
const context = {
  env,
  authentication: { user: { id: "actor" }, session: { id: "login" }, authMethod: "session" },
} as unknown as ServerOperationContext;
const turn = {
  context: emptyChatContext(),
  assistantText: "Answer",
  progress: { activities: [], canContinue: false },
};
const run = { id: "run", turnId: "turn", threadId: "thread", status: "completed", seq: 1 };
function prepare(expiresAt = new Date(Date.now() + 60_000)) {
  const agent = createAgentState("workspace", [], []);
  recordDebugEvent(agent, "tool.result", { text: "Saved source data" }, { tool: "read_page" });
  const sealed = sealRunInput(env, "run", {
    messages: [],
    maxOutputTokens: 4096,
    model: "test-model",
    agent,
  });
  mocks.rows = [[{ id: "login" }], [{ run, turn }], [turn], [{ sealed, expiresAt }]];
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockResolvedValue({ id: "actor" });
  mocks.history.mockResolvedValue(undefined);
  mocks.select.mockImplementation(() => {
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      where: () => Promise.resolve(mocks.rows.shift() ?? []),
    };
    return builder;
  });
  prepare();
});

test("debug endpoint decrypts only after session, run owner and all conversation sources are checked", async () => {
  const result = await readChatRunDebug(context, "run", "workspace");
  expect(result).toMatchObject({ available: true, model: "test-model", status: "completed" });
  expect(result.events[0]!.payload).toContain("Saved source data");
  expect(mocks.workspace).toHaveBeenCalledWith(context, "workspace");
  expect(mocks.history).toHaveBeenCalledTimes(2);
  expect(mocks.history.mock.calls[1]![2]).toEqual([turn]);
});

test("expired debug payloads are not decrypted or returned", async () => {
  prepare(new Date(0));
  const result = await readChatRunDebug(context, "run", "workspace");
  expect(result).toMatchObject({ available: false, events: [] });
});

test("an invalid session cannot fetch encrypted debug payloads", async () => {
  mocks.rows[0] = [];
  await expect(readChatRunDebug(context, "run", "workspace")).rejects.toMatchObject({
    status: 401,
  });
  expect(mocks.select).toHaveBeenCalledTimes(1);
});

test("a run outside the caller's owner/workspace scope cannot fetch debug payloads", async () => {
  mocks.rows[1] = [];
  await expect(readChatRunDebug(context, "run", "workspace")).rejects.toMatchObject({
    status: 404,
  });
  expect(mocks.select).toHaveBeenCalledTimes(2);
});

test("revocation of an earlier conversation source blocks debug reads before loading payloads", async () => {
  mocks.history
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new ServerOperationError({ error: "Source no longer accessible" }, 409));
  await expect(readChatRunDebug(context, "run", "workspace")).rejects.toMatchObject({
    status: 409,
  });
  expect(mocks.select).toHaveBeenCalledTimes(3);
});
