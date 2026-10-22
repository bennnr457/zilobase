import type { ChatReadProgress, ChatRunReceipt, ChatThreadDetail } from "@zilobase/features/ai";
import { chatDisplayText } from "@zilobase/features/ai";
import { prosemirrorToMarkdown, type BuildContextResult } from "@zilobase/page-context";
import { chatRequestSchema, type ChatRequestInput } from "@zilobase/features/runtime";

// Scripted server transport: references are not evidence until a simulated tool
// read succeeds. The real agent, authorization and persistence have server tests;
// browser tests exercise the production shared client and UI against these events.
export function createAiRuntimeFixture(
  pages: Array<{ id: string; name: string; [key: string]: any }>,
) {
  const at = "2026-10-20T00:00:00Z";
  const page = {
    ...pages[0],
    metadata: { ...pages[0]?.metadata, emoji: "📝" },
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Saved server plan" }] },
        { type: "databaseBlock", attrs: { databaseId: "database" } },
      ],
    },
  };
  const source = {
    id: "source",
    workspaceId: "workspace",
    parentDatabaseId: "database",
    name: "Tasks",
    config: {},
    configVersion: 1,
    version: 1,
    position: 0,
    linkedAt: null,
    createdAt: at,
    updatedAt: at,
  };
  const database = {
    id: "database",
    workspaceId: "workspace",
    pageId: null,
    name: "New database",
    accessLevel: "full",
    config: {},
    version: 1,
    deletedAt: null,
    createdAt: at,
    updatedAt: at,
  };
  const exported = {
    viewerType: "member",
    database,
    activeDataSource: source,
    dataSources: [source],
    properties: [],
    values: [],
    rows: [
      {
        id: "row-child",
        dataSourceId: "source",
        pageId: "child",
        parentRowId: null,
        position: 0,
        orderKey: "0",
        createdAt: at,
        updatedAt: at,
        page: { ...pages[1], metadata: { ...pages[1]?.metadata, emoji: "✅" } },
      },
    ],
    rowCount: 800,
    rowsPagination: { hasMore: true, nextCursor: 1 },
    views: [
      {
        id: "all",
        databaseId: "database",
        dataSourceId: "source",
        name: "All tasks",
        type: "table",
        position: 0,
        config: {},
        createdAt: at,
        updatedAt: at,
      },
      {
        id: "board",
        databaseId: "database",
        dataSourceId: "source",
        name: "Status board",
        type: "kanban",
        position: 1,
        config: { hiddenProperties: ["secret-column"] },
        createdAt: at,
        updatedAt: at,
      },
    ],
  };
  const stored = sessionStorage.getItem("ai-fixture-threads");
  const threads: ChatThreadDetail[] = stored ? JSON.parse(stored) : [];
  const persist = () => sessionStorage.setItem("ai-fixture-threads", JSON.stringify(threads));
  let releaseRead: (() => void) | undefined;
  const pendingThreadReads: Array<() => void> = [];
  const controls = {
    durable: new URLSearchParams(location.search).get("durableAi") === "1",
    toolMode: new URLSearchParams(location.search).get("toolAi") === "1",
    cachedInspection: false,
    workspaceId: "workspace",
    holdReads: false,
    debugDenied: false,
    debugExpired: false,
    holdStream: false,
    holdFirstToken: false,
    releaseFirstToken: () => {},
    holdThreadReads: false,
    failThreadReads: false,
    failNext: false,
    requests: [] as ChatRequestInput[],
    reads: [] as string[],
    cancelled: 0,
    extraSearchPages: 0,
    searchRequests: [] as string[],
    localText: "Unsynced editor plan",
    forbidden: false,
    appendAnswer: (_text: string) => {},
    releaseReads() {
      controls.holdReads = false;
      releaseRead?.();
    },
    releaseThreadReads() {
      controls.holdThreadReads = false;
      pendingThreadReads.splice(0).forEach((release) => release());
    },
  };
  const auth = {
    getSession: async () => ({
      user: { id: "actor", name: "Maya", email: "maya@test.invalid" },
      session: { id: "ai-session", userId: "actor", activeWorkspaceId: controls.workspaceId },
    }),
    listWorkspaces: async () =>
      ["workspace", "other"].map((id) => ({ id, name: id, slug: id, createdAt: at })),
  };
  const emptyContext = (): BuildContextResult => ({
    version: 1,
    status: "complete",
    markdown: "",
    charCount: 0,
    manifest: [],
    omissions: [],
    trimmedAttachmentIds: [],
  });
  const pageContext = (): BuildContextResult => ({
    ...emptyContext(),
    manifest: [
      {
        key: `page:${page.id}`,
        type: "page",
        id: page.id,
        pageId: page.id,
        title: page.name,
        provenance: { capturedAt: at, origin: "saved", revision: "fixture-page-1" },
      },
    ],
  });
  const recordsContext = (
    context: BuildContextResult,
    hasMore: boolean,
    inspectionOnly = false,
  ): BuildContextResult => ({
    ...context,
    status: hasMore ? "partial" : "complete",
    omissions: hasMore ? ["1 source reads have additional pages. Results are not exhaustive."] : [],
    manifest: [
      ...context.manifest.filter((entry) => entry.type === "page"),
      {
        key: "database:database",
        type: "database",
        id: "database",
        databaseId: "database",
        title: "Database",
        provenance: { capturedAt: at, origin: "saved", revision: "fixture-source-1" },
      },
      {
        key: "source:source",
        type: "source",
        id: "source",
        databaseId: "database",
        sourceId: "source",
        title: "Records",
        provenance: { capturedAt: at, origin: "saved", revision: "fixture-source-1" },
      },
      ...(inspectionOnly
        ? []
        : exported.rows.map((row) => ({
            key: `record:source:${row.id}`,
            type: "record" as const,
            id: row.id,
            title: row.page.name,
            databaseId: "database",
            sourceId: "source",
            pageId: row.pageId,
            provenance: { capturedAt: at, origin: "saved" as const, revision: "fixture-source-1" },
          }))),
    ],
  });
  const pageReadProgress = (status: "running" | "completed" | "failed"): ChatReadProgress => ({
    activities: [
      {
        id: "read-1",
        name: "read_page",
        label: "Reading page",
        source: { type: "page", id: page.id },
        status,
        ...(status === "completed" ? { returned: 2, hasMore: false } : {}),
        ...(status === "failed" ? { error: "SOURCE_UNAVAILABLE" } : {}),
      },
    ],
    canContinue: false,
  });
  async function api(path: string, options?: RequestInit): Promise<unknown> {
    if (path.startsWith("/ai/sources/")) {
      controls.reads.push(path);
      const type = path.split("/")[3];
      const id = path.split("/")[4]?.split("?")[0];
      if (
        (type === "page" && !pages.some((page) => page.id === id)) ||
        (type === "database" && id !== "database")
      )
        throw Object.assign(new Error("Source unavailable"), { status: 404 });
      return type === "database"
        ? { title: "Tasks", emoji: "🗃️" }
        : {
            title: id === "main" ? page.name : (pages[1]?.name ?? "Page"),
            emoji: id === "main" ? "📝" : "✅",
          };
    }
    if (path === "/ai/capabilities") return { durable: controls.durable };
    if (path === "/ai/turns") {
      const raw = JSON.parse(String(options?.body));
      controls.requests.push(raw);
      const request = chatRequestSchema.parse(raw);
      const previous = threads.find((item) => item.run?.requestId === request.requestId);
      if (previous) return structuredClone(previous.run);
      let detail = threads.find((item) => item.thread.id === request.threadId);
      if (!detail) {
        detail = {
          thread: {
            id: crypto.randomUUID(),
            workspaceId: request.workspaceId,
            title: chatDisplayText(request.text).trim(),
            updatedAt: at,
          },
          roots: request.roots,
          messages: [],
        };
        threads.unshift(detail);
      }
      const context =
        request.continueFromRunId && request.continueFromRunId === detail.run?.runId
          ? structuredClone(detail.run.context ?? emptyContext())
          : emptyContext();
      detail.run = {
        requestId: request.requestId,
        runId: crypto.randomUUID(),
        turnId: request.requestId,
        threadId: detail.thread.id,
        seq: 1,
        status: "running",
        text: "Partial",
        context,
      };
      if (controls.toolMode)
        detail.run.progress = {
          activities: [
            {
              id: "read-records",
              name: "query_records",
              label: "Reading records",
              source: { type: "database", id: "database", dataSourceId: "source" },
              status: "running",
            },
          ],
          canContinue: false,
        };
      detail.thread.status = "running";
      detail.messages.push(
        { id: `${request.requestId}:user`, role: "user", text: request.text, roots: request.roots },
        {
          id: `${request.requestId}:assistant`,
          role: "assistant",
          text: "Partial",
          status: "streaming",
          roots: request.roots,
          context,
        },
      );
      sessionStorage.setItem(
        "ai-fixture-provider-starts",
        String(Number(sessionStorage.getItem("ai-fixture-provider-starts") ?? 0) + 1),
      );
      persist();
      return structuredClone(detail.run);
    }
    if (path.startsWith("/ai/requests/") || path.startsWith("/ai/runs/")) {
      const id = path.split("/")[3]?.split("?")[0];
      const detail = threads.find((item) => item.run?.runId === id || item.run?.requestId === id);
      if (!detail?.run) throw Object.assign(new Error("Run not found"), { status: 404 });
      if (path.includes("/debug")) {
        controls.reads.push(path);
        if (controls.debugDenied)
          throw Object.assign(new Error("Source access denied"), { status: 403 });
        return {
          runId: detail.run.runId,
          status: detail.run.status,
          model: "fixture-model",
          available: !controls.debugExpired,
          omitted: 0,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          events: controls.debugExpired
            ? []
            : [
                {
                  id: 1,
                  at,
                  step: 1,
                  type: "tool.call",
                  tool: "read_page",
                  toolCallId: "read-1",
                  payload: JSON.stringify({ pageId: "main", cursor: null }),
                },
                ...(["completed", "stopped"].includes(detail.run.status)
                  ? [
                      {
                        id: 2,
                        at,
                        step: 1,
                        type: "tool.result",
                        tool: "read_page",
                        toolCallId: "read-1",
                        durationMs: 24,
                        payload: JSON.stringify({
                          title: "Customer feedback review",
                          entries: [{ kind: "text", text: "Saved server plan" }],
                          coverage: { complete: true },
                        }),
                      },
                      {
                        id: 3,
                        at,
                        step: 1,
                        type: "run.completed",
                        payload: JSON.stringify({ calls: 1 }),
                      },
                    ]
                  : []),
              ],
        };
      }
      if (path.includes("/cancel")) {
        controls.cancelled++;
        detail.run.status = "stopped";
        detail.run.seq++;
        detail.messages.at(-1)!.status = "stopped";
        detail.thread.status = "stopped";
        persist();
      }
      return structuredClone(detail.run);
    }
    if (path.includes("teamspace-settings")) return { canManage: true };
    if (path.includes("teamspaces")) return { teamspaces: [] };
    if (path.includes("notifications")) return { notifications: [], unreadCount: 0 };
    if (path.includes("integration") || path.includes("calendar"))
      return { providerConfigured: false };
    if (path.startsWith("/ai/threads")) {
      const id = path.split("?")[0]!.split("/")[3];
      if (!id)
        return threads
          .filter(
            (item) =>
              item.thread.workspaceId ===
              new URL(path, location.origin).searchParams.get("workspaceId"),
          )
          .map((item) => item.thread);
      const index = threads.findIndex((item) => item.thread.id === id);
      if (options?.method === "DELETE") {
        threads.splice(index, 1);
        persist();
        return { success: true };
      }
      if (index < 0) throw new Error("Conversation not found");
      if (controls.holdThreadReads)
        await new Promise<void>((resolve) => pendingThreadReads.push(resolve));
      if (controls.failThreadReads) throw new Error("Could not load this conversation");
      return structuredClone(threads[index]);
    }
    if (path.startsWith("/search?")) {
      controls.searchRequests.push(path);
      const params = new URL(path, location.origin).searchParams;
      const q = (params.get("q") ?? "").toLowerCase();
      const types = params.get("types")?.split(",") ?? ["page", "database"];
      return {
        results: [
          ...Array.from({ length: controls.extraSearchPages }, (_, index) => ({
            id: `extra-${index}`,
            type: "page",
            title: `A page ${index}`,
            path: `A page ${index}`,
            emoji: null,
            entity: { ...page, id: `extra-${index}`, name: `A page ${index}` },
          })),
          { id: "main", type: "page", title: "main", path: "main", emoji: null, entity: page },
          {
            id: "database",
            type: "database",
            title: "Tasks",
            path: "Tasks",
            emoji: null,
            entity: database,
            titleSource: source,
          },
        ]
          .filter((item) => types.includes(item.type) && item.title.toLowerCase().includes(q))
          .slice(0, 50),
      };
    }
    if (path.startsWith("/databases/database/bootstrap")) {
      controls.reads.push(path);
      if (controls.forbidden) throw new Error("Resource unavailable");
      return {
        viewerType: "member",
        database,
        dataSources: [source],
        properties: [],
        views: exported.views,
      };
    }
    if (path.startsWith("/pages/main") || path.includes("/export")) {
      controls.reads.push(path);
      if (controls.holdReads)
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
      if (controls.forbidden) throw new Error("Resource unavailable");
      return path.includes("/export")
        ? exported
        : { viewerType: "member", page, accessLevel: "full", databaseIds: ["database"] };
    }
    return undefined;
  }
  const streamFetch = async (_path: string, init: RequestInit) => {
    if (_path.startsWith("/ai/runs/")) {
      const id = _path.split("/")[3];
      const detail = threads.find((item) => item.run?.runId === id)!;
      let cursor = Number(new URL(_path, location.origin).searchParams.get("after"));
      let timer: ReturnType<typeof setTimeout> | undefined;
      let closed = false;
      const stop = () => {
        closed = true;
        clearTimeout(timer);
      };
      return new Response(
        new ReadableStream({
          start(controller) {
            const poll = () => {
              if (closed) return;
              const write = (seq: number, event: unknown) =>
                controller.enqueue(
                  new TextEncoder().encode(
                    JSON.stringify({ version: 1, runId: id, seq, event }) + "\n",
                  ),
                );
              const run = detail.run as ChatRunReceipt;
              if (
                !controls.holdStream &&
                !controls.holdReads &&
                controls.forbidden &&
                run.status === "running"
              ) {
                run.status = "failed";
                run.seq = 3;
                run.progress = pageReadProgress("failed");
                detail.messages.at(-1)!.progress = run.progress;
                detail.messages.at(-1)!.status = "failed";
                detail.thread.status = "failed";
                persist();
              }
              if (!controls.holdStream && !controls.holdReads && run.status === "running") {
                run.text = "Partial answer";
                run.status = "completed";
                run.seq = 4;
                run.context = pageContext();
                run.progress = pageReadProgress("completed");
                if (controls.toolMode) {
                  const hasMore = !controls.requests.at(-1)?.continueFromRunId;
                  run.context = recordsContext(emptyContext(), hasMore, controls.cachedInspection);
                  run.progress = {
                    activities: [
                      {
                        id: "read-records",
                        name: controls.cachedInspection ? "describe_source" : "query_records",
                        label: controls.cachedInspection ? "Inspecting source" : "Reading records",
                        source: { type: "database", id: "database", dataSourceId: "source" },
                        cached: controls.cachedInspection || undefined,
                        status: "completed",
                        returned: controls.cachedInspection ? 1 : exported.rows.length,
                        hasMore,
                      },
                    ],
                    canContinue: !controls.requests.at(-1)?.continueFromRunId,
                    ...(controls.cachedInspection ? { stopReason: "no_progress" } : {}),
                  };
                }
                detail.messages.at(-1)!.context = run.context;
                detail.messages.at(-1)!.progress = run.progress;
                detail.messages.at(-1)!.runId = run.runId;
                detail.messages.at(-1)!.text = run.text;
                detail.messages.at(-1)!.status = "completed";
                detail.thread.status = "completed";
                persist();
              }
              if (run.status === "completed") {
                if (cursor < 2)
                  write(2, {
                    type: "read-progress",
                    context: run.context,
                    progress: run.progress,
                  });
                if (cursor < 3) write(3, { type: "delta", text: " answer" });
                if (cursor < 4) write(4, { type: "done", status: "completed" });
                cursor = 4;
                stop();
                controller.close();
              } else if (run.status === "stopped") {
                write(run.seq, { type: "done", status: "stopped" });
                stop();
                controller.close();
              } else if (run.status === "failed") {
                if (cursor < 2)
                  write(2, { type: "read-progress", context: run.context, progress: run.progress });
                if (cursor < 3)
                  write(3, {
                    type: "error",
                    message: "Source unavailable. Attach an accessible source.",
                  });
                stop();
                controller.close();
              } else timer = setTimeout(poll, 50);
            };
            const abort = () => {
              stop();
              controller.close();
            };
            init.signal?.addEventListener("abort", abort, { once: true });
            // Cancel removes only this subscriber, never the stored run.
            poll();
          },
          cancel: stop,
        }),
      );
    }
    const raw = JSON.parse(String(init.body));
    controls.requests.push(raw);
    const request = chatRequestSchema.parse(raw);
    if (controls.failNext) {
      controls.failNext = false;
      throw new Error("Connection lost. Retry your message.");
    }
    const context = emptyContext();
    let detail = threads.find((item) => item.thread.id === request.threadId);
    if (!detail) {
      detail = {
        thread: {
          id: crypto.randomUUID(),
          title: chatDisplayText(request.text).trim(),
          workspaceId: request.workspaceId,
          updatedAt: at,
        },
        roots: request.roots,
        messages: [],
      };
      threads.unshift(detail);
    }
    const answer =
      "Attached records are partial. [[page:main]] [[record:source:row-child]] [[page:invented]]";
    const assistant = {
      id: `${request.requestId}:assistant`,
      role: "assistant" as const,
      text: "",
      status: "streaming" as "streaming" | "completed" | "stopped" | "failed",
      roots: request.roots,
      context,
      progress: pageReadProgress("running"),
    };
    detail.roots = request.roots;
    detail.messages.push(
      { id: `${request.requestId}:user`, role: "user", text: request.text, roots: request.roots },
      assistant,
    );
    persist();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    return new Response(
      new ReadableStream({
        start(controller) {
          const write = (event: unknown) =>
            controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
          const readProgress = (context: BuildContextResult, progress: ChatReadProgress) => {
            assistant.context = context;
            assistant.progress = progress;
            write({ type: "read-progress", context, progress });
            persist();
          };
          write({ type: "context", context, threadId: detail!.thread.id });
          readProgress(context, assistant.progress);
          write({
            type: "debug",
            omitted: 0,
            events: [
              {
                id: 1,
                at,
                step: 1,
                type: "tool.call",
                tool: "read_page",
                toolCallId: "read-1",
                payload: JSON.stringify({ pageId: "main" }),
              },
            ],
          });
          controls.appendAnswer = (text) => {
            if (closed) return;
            assistant.text += text;
            write({ type: "delta", text });
            persist();
          };
          persist();
          const stop = () => {
            if (closed) return;
            closed = true;
            clearTimeout(timer);
            controls.cancelled++;
            assistant.status = "stopped";
            persist();
            controller.close();
          };
          init.signal?.addEventListener("abort", stop, { once: true });
          let readsCompleted = false;
          const startAnswer = () => {
            if (closed || !readsCompleted || controls.holdFirstToken) return;
            assistant.text = answer;
            write({ type: "delta", text: answer });
            persist();
            if (!controls.holdStream)
              timer = setTimeout(() => {
                if (closed) return;
                closed = true;
                assistant.status = "completed";
                persist();
                write({ type: "done", status: "completed" });
                controller.close();
                init.signal?.removeEventListener("abort", stop);
              }, 100);
          };
          const completeReads = () => {
            if (closed || readsCompleted) return;
            if (controls.forbidden) {
              readProgress(emptyContext(), pageReadProgress("failed"));
              closed = true;
              assistant.status = "failed";
              persist();
              write({ type: "error", message: "Source unavailable. Attach an accessible source." });
              controller.close();
              return;
            }
            write({
              type: "debug",
              omitted: 0,
              events: [
                {
                  id: 2,
                  at,
                  step: 1,
                  type: "tool.result",
                  tool: "read_page",
                  toolCallId: "read-1",
                  payload: JSON.stringify({
                    title: page.name,
                    entries: [
                      { kind: "text", block: 0, text: prosemirrorToMarkdown(page.content) },
                      { kind: "reference", resource: { type: "database", id: "database" } },
                    ],
                    coverage: { complete: true },
                  }),
                },
              ],
            });
            readProgress(pageContext(), pageReadProgress("completed"));
            // An embedded database reference alone never adds record evidence.
            // This scenario explicitly follows the database when it was mentioned.
            if (request.roots.some((root) => root.type === "database" && root.id === "database")) {
              const progress: ChatReadProgress = {
                activities: [
                  ...assistant.progress.activities,
                  {
                    id: "read-records",
                    name: "query_records",
                    label: "Reading records",
                    source: { type: "database", id: "database", dataSourceId: "source" },
                    status: "running",
                  },
                ],
                canContinue: false,
              };
              readProgress(assistant.context, progress);
              readProgress(recordsContext(assistant.context, true), {
                activities: progress.activities.map((activity) =>
                  activity.id === "read-records"
                    ? {
                        ...activity,
                        status: "completed",
                        returned: exported.rows.length,
                        hasMore: true,
                      }
                    : activity,
                ),
                canContinue: true,
              });
            }
            readsCompleted = true;
            startAnswer();
          };
          controls.releaseFirstToken = () => {
            if (!controls.holdFirstToken) return;
            controls.holdFirstToken = false;
            startAnswer();
          };
          if (controls.holdReads) releaseRead = completeReads;
          else completeReads();
        },
        cancel() {
          if (!closed) {
            closed = true;
            clearTimeout(timer);
            controls.cancelled++;
            assistant.status = "stopped";
            persist();
          }
        },
      }),
      { headers: { "Content-Type": "application/x-ndjson" } },
    );
  };
  return { controls, auth, api, streamFetch };
}
