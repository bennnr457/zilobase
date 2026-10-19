import type { ChatThreadDetail } from "@zilobase/features/ai";
import { buildContextMarkdown } from "@zilobase/page-context";
import { collectWorkspaceContext, type ChatRequest } from "@zilobase/features/runtime";

// Deterministic transport fixture; production acquisition, rendering, shared-client
// cache and UI code run unchanged. Real authorization/persistence is tested in PostgreSQL.
export function createAiRuntimeFixture(pages: Array<Record<string, any>>) {
  const at = "2026-10-20T00:00:00Z";
  const page = {
    ...pages[0],
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
    name: "Tasks",
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
        page: pages[1],
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
  const controls = {
    workspaceId: "workspace",
    holdReads: false,
    holdStream: false,
    failNext: false,
    requests: [] as ChatRequest[],
    reads: [] as string[],
    cancelled: 0,
    localText: "Unsynced editor plan",
    forbidden: false,
    releaseReads() {
      controls.holdReads = false;
      releaseRead?.();
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
      return structuredClone(threads[index]);
    }
    if (path.startsWith("/search?")) {
      const q = new URL(path, location.origin).searchParams.get("q")!.toLowerCase();
      return {
        results: [
          { id: "main", type: "page", title: "main", path: "main", emoji: null, entity: page },
          {
            id: "database",
            type: "database",
            title: "Tasks",
            path: "Tasks",
            emoji: null,
            entity: database,
          },
        ].filter((item) => item.title.toLowerCase().includes(q)),
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
          assistant.text = answer;
          write({ type: "delta", text: answer });
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
