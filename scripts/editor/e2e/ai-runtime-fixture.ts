import type { ChatRunReceipt, ChatThreadDetail } from "@zilobase/features/ai";
import { buildContextMarkdown } from "@zilobase/page-context";
import { collectWorkspaceContext, type ChatRequest } from "@zilobase/features/runtime";

// Deterministic transport fixture; production acquisition, rendering, shared-client
// cache and UI code run unchanged. Real authorization/persistence is tested in PostgreSQL.
export function createAiRuntimeFixture(pages: Array<Record<string, any>>) {
  const at = "2026-10-20T00:00:00Z";
  const page = {
    ...pages[0],
    metadata: { ...pages[0]?.metadata, emoji: "📝" },
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Saved plan" }] },
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
    workspaceId: "workspace",
    holdReads: false,
    holdStream: false,
    holdFirstToken: false,
    releaseFirstToken: () => {},
    holdThreadReads: false,
    failThreadReads: false,
    failNext: false,
    requests: [] as ChatRequest[],
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
  async function api(path: string, options?: RequestInit): Promise<unknown> {
    if (path === "/ai/capabilities") return { durable: controls.durable };
    if (path === "/ai/turns") {
      const request = JSON.parse(String(options?.body)) as ChatRequest;
      controls.requests.push(request);
      const previous = threads.find((item) => item.run?.requestId === request.requestId);
      if (previous) return structuredClone(previous.run);
      const context = buildContextMarkdown({
        context: await collectWorkspaceContext(request, {
          check: () => {},
          now: () => at,
          page: async () => page as any,
          database: async () => exported,
        }),
      });
      let detail = threads.find((item) => item.thread.id === request.threadId);
      if (!detail) {
        detail = {
          thread: {
            id: crypto.randomUUID(),
            workspaceId: request.workspaceId,
            title: request.text,
            updatedAt: at,
          },
          roots: request.roots,
          messages: [],
        };
        threads.unshift(detail);
      }
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
      detail.thread.status = "running";
      detail.messages.push(
        { id: `${request.requestId}:user`, role: "user", text: request.text },
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
              if (!controls.holdStream && run.status === "running") {
                run.text = "Partial answer";
                run.status = "completed";
                run.seq = 3;
                detail.messages.at(-1)!.text = run.text;
                detail.messages.at(-1)!.status = "completed";
                detail.thread.status = "completed";
                persist();
              }
              if (run.status === "completed") {
                if (cursor < 2) write(2, { type: "delta", text: " answer" });
                if (cursor < 3) write(3, { type: "done", status: "completed" });
                cursor = 3;
                stop();
                controller.close();
              } else if (run.status === "stopped") {
                write(run.seq, { type: "done", status: "stopped" });
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
    const request = JSON.parse(String(init.body)) as ChatRequest;
    controls.requests.push(request);
    if (controls.failNext) {
      controls.failNext = false;
      throw new Error("Connection lost. Retry your message.");
    }
    const context = buildContextMarkdown({
      context: await collectWorkspaceContext(request, {
        check: () => init.signal?.throwIfAborted(),
        now: () => at,
        page: async () => page as any,
        database: async () => exported,
      }),
    });
    let detail = threads.find((item) => item.thread.id === request.threadId);
    if (!detail) {
      detail = {
        thread: {
          id: crypto.randomUUID(),
          title: request.text,
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
      status: "streaming" as "streaming" | "completed" | "stopped",
      roots: request.roots,
      context: {
        ...context,
        markdown: "",
        omissions: [...context.omissions, "Historical source content is not retained."],
      },
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
          write({ type: "context", context, threadId: detail!.thread.id });
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
          const startAnswer = () => {
            if (closed) return;
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
          controls.releaseFirstToken = () => {
            if (!controls.holdFirstToken) return;
            controls.holdFirstToken = false;
            startAnswer();
          };
          if (!controls.holdFirstToken) startAnswer();
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
