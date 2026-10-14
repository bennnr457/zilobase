import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createZilobaseClient, ZilobaseFeaturesProvider } from "@zilobase/features";
import { createApiAuthClient, type SessionResponse } from "@zilobase/features/auth";
import {
  createEditorBridge,
  pageQueryOptions,
  resolvePageDetailReference,
  type EditorBridgeScope,
  type EditorBridgeStatus,
} from "@zilobase/features/pages";
import { useDatabaseController } from "@zilobase/features/databases/react";
import { apiFetch } from "@/platform/network/api";
import { setHostedEditorAuthToken } from "@/platform/auth/hosted-editor-auth";
import { webClientCacheStorage } from "@/platform/storage/client-cache-storage";
import { pageCacheDeploymentKey } from "@/platform/storage/page-cache-database";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { ShortcutProvider } from "@/shared/shortcuts";
import {
  PageCommentsRegistryProvider,
  PageEditorCommentsProvider,
} from "@/features/comments/index";
import { PageEditorPane } from "@/features/pages/pane/page-editor-pane";
import { PageEditorRegistryProvider, usePageEditorRegistry } from "../runtime/page-editor-registry";
import { installEditorHostTransport, sendEditorHostMessage } from "./transport";

const root = createRoot(document.getElementById("root")!, {
  onUncaughtError: () => {
    bridge.notify({ type: "error", code: "editor" });
    void bridge.dispose();
  },
});
let mounted: MountedEditor | null = null;
let opening: string | null = null;
let databaseIds: string[] = [];
type Runtime = ReturnType<typeof createZilobaseClient>;
type MountedEditor = {
  open: (pageId: string) => Promise<void>;
  focus: () => void;
  flush: () => Promise<void>;
  status: () => EditorBridgeStatus;
  dispose: () => void;
};
let runtime: Runtime | null = null;
let scope: EditorBridgeScope | null = null;
const auth = createApiAuthClient(apiFetch);
const bridge = createEditorBridge(
  {
    async initialize(identity, sessionToken) {
      if (!navigator.onLine || identity.deployment !== pageCacheDeploymentKey())
        throw new Error("Connection required.");
      setHostedEditorAuthToken(sessionToken);
      const session = await auth.getSession();
      if (
        session.user?.id !== identity.accountId ||
        session.session?.id !== identity.sessionId ||
        session.session?.activeWorkspaceId !== identity.workspaceId
      )
        throw new Error("Identity mismatch.");
      scope = identity;
      runtime = createZilobaseClient({ deployment: identity.deployment });
      runtime.queryClient.setQueryData(["session"], session);
      const current = runtime;
      const route = createRootRoute({ component: HostedSurface });
      const editorRouter = createRouter({
        history: createMemoryHistory({ initialEntries: ["/editor"] }),
        routeTree: route.addChildren([
          createRoute({ getParentRoute: () => route, path: "/editor" }),
          createRoute({
            getParentRoute: () => route,
            path: "/p/$pageId",
            beforeLoad: ({ params }) => {
              bridge.notify({ type: "navigation", target: { kind: "page", id: params.pageId } });
            },
          }),
          createRoute({
            getParentRoute: () => route,
            path: "/d/$databaseId",
            beforeLoad: ({ params }) => {
              bridge.notify({
                type: "navigation",
                target: { kind: "database", id: params.databaseId },
              });
            },
          }),
        ]),
      });
      await editorRouter.load();
      const getSession = async (signal?: AbortSignal): Promise<SessionResponse> => {
        const next = await auth.getSession(signal);
        if (
          next.user?.id !== identity.accountId ||
          next.session?.id !== identity.sessionId ||
          next.session?.activeWorkspaceId !== identity.workspaceId
        ) {
          bridge.notify({ type: "error", code: "authentication" });
          void bridge.dispose();
          throw new Error("Identity changed.");
        }
        return next;
      };
      flushSync(() =>
        root.render(
          <ZilobaseFeaturesProvider
            value={{
              deployment: identity.deployment,
              queryClient: current.queryClient,
              auth: { ...auth, getSession },
              apiFetch,
              cacheStorage: webClientCacheStorage,
              preferredActiveWorkspaceId: identity.workspaceId,
            }}
          >
            <ShortcutProvider>
              <TooltipProvider>
                <PageEditorRegistryProvider>
                  <PageCommentsRegistryProvider>
                    <PageEditorCommentsProvider>
                      <RouterProvider router={editorRouter} />
                    </PageEditorCommentsProvider>
                  </PageCommentsRegistryProvider>
                </PageEditorRegistryProvider>
              </TooltipProvider>
            </ShortcutProvider>
          </ZilobaseFeaturesProvider>,
        ),
      );
    },
    async openPage(pageId) {
      if (!runtime || !scope || !mounted) throw new Error("Editor not initialized.");
      const reference = await runtime.queryClient.fetchQuery(pageQueryOptions(apiFetch, pageId));
      const detail = resolvePageDetailReference(runtime.queryClient, reference);
      if (!detail || detail.page.workspaceId !== scope.workspaceId)
        throw new Error("Page unavailable.");
      if (opening) await mounted.flush();
      databaseIds = detail.databaseIds ?? [];
      await mounted.open(pageId);
    },
    focus() {
      if (!mounted || !opening) throw new Error("No open page.");
      mounted.focus();
    },
    async flushLocal() {
      if (!mounted || !opening) throw new Error("No open page.");
      await mounted.flush();
    },
    async close() {
      try {
        if (mounted && opening) await mounted.flush();
      } finally {
        mounted?.dispose();
        flushSync(() => root.render(null));
        runtime?.dispose();
        runtime = null;
        scope = null;
        mounted = null;
        opening = null;
        databaseIds = [];
        setHostedEditorAuthToken(null);
      }
    },
    status: () => mounted?.status() ?? { pageId: null, state: "closed" },
  },
  sendEditorHostMessage,
);

function HostedSurface() {
  const registry = usePageEditorRegistry();
  const controller = useDatabaseController();
  const [pageId, setPageId] = useState<string | null>(null);
  const pageRef = useRef<string | null>(null);
  useEffect(() => {
    let previousContent: string | null = null;
    let unconfirmed = false;
    let lastStatus = "";
    let lastError: string | null = null;
    const status = (): EditorBridgeStatus => {
      const id = pageRef.current;
      const handle = id ? registry.getEditorHandle(id) : null;
      return {
        pageId: id,
        state: !navigator.onLine
          ? "offline"
          : !handle?.getContentJson()
            ? "connecting"
            : handle.isServerConfirmed?.()
              ? "synchronized"
              : "pending",
      };
    };
    const publish = () => {
      const current = status();
      const handle = pageRef.current ? registry.getEditorHandle(pageRef.current) : null;
      const content = JSON.stringify(handle?.getContentJson() ?? null);
      if (previousContent !== null && previousContent !== content) unconfirmed = true;
      previousContent = content;
      const serializedStatus = JSON.stringify(current);
      if (serializedStatus !== lastStatus) {
        lastStatus = serializedStatus;
        bridge.notify({ type: "status", status: current });
      }
      const error = handle?.getError?.() ?? null;
      if (error && error !== lastError) bridge.notify({ type: "error", code: error });
      lastError = error;
      if (unconfirmed && current.state === "synchronized" && current.pageId) {
        unconfirmed = false;
        bridge.notify({
          type: "changed",
          records: [
            { kind: "page", id: current.pageId },
            { kind: "navigation", id: scope!.workspaceId },
          ],
        });
      }
    };
    const notifyRecords = () => {
      if (!pageRef.current || !scope) return;
      bridge.notify({
        type: "changed",
        records: [
          { kind: "page", id: pageRef.current },
          { kind: "navigation", id: scope.workspaceId },
          ...databaseIds.map((id) => ({ kind: "database" as const, id })),
        ],
      });
    };
    const unsubscribeMutations = runtime!.queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") notifyRecords();
    });
    let databasePending = false;
    const unsubscribeCommands = controller.commandState.subscribe(() => {
      const pending = controller.commandState.hasPending();
      if (
        databasePending &&
        !pending &&
        !controller.commandState.get({}).error &&
        !controller.getSynchronizationError()
      )
        notifyRecords();
      databasePending = pending;
    });
    const unsubscribe = registry.subscribe(publish);
    // Registry publication tracks sync receipts; local content changes are observed between receipts.
    const interval = window.setInterval(publish, 250);
    window.addEventListener("online", publish);
    window.addEventListener("offline", publish);
    mounted = {
      async open(id) {
        pageRef.current = id;
        opening = id;
        previousContent = null;
        unconfirmed = false;
        flushSync(() => setPageId(id));
        const started = Date.now();
        while (!registry.getEditorHandle(id)?.getContentJson()) {
          if (Date.now() - started > 15_000 || !runtime) throw new Error("Editor unavailable.");
          await new Promise((resolve) => window.setTimeout(resolve, 25));
        }
        publish();
      },
      focus: () => registry.getEditorHandle(pageRef.current!)?.focus?.(),
      async flush() {
        const handle = registry.getEditorHandle(pageRef.current!);
        if (!handle?.flushLocal) throw new Error("Storage unavailable.");
        await handle.flushLocal();
      },
      status,
      dispose: () => registry.documentSessions.dispose(),
    };
    return () => {
      unsubscribe();
      unsubscribeMutations();
      unsubscribeCommands();
      window.clearInterval(interval);
      window.removeEventListener("online", publish);
      window.removeEventListener("offline", publish);
      registry.documentSessions.dispose();
      mounted = null;
    };
  }, [registry, controller]);
  return (
    <main className="h-svh overflow-auto bg-surface-canvas" data-hosted-editor>
      {pageId ? (
        <PageEditorPane
          key={pageId}
          pageId={pageId}
          hideChrome
          enableComments={false}
          showCollaborationPresence={false}
          onOpenPage={(id) => bridge.notify({ type: "navigation", target: { kind: "page", id } })}
        />
      ) : null}
    </main>
  );
}
const detach = installEditorHostTransport(bridge.receive, pageCacheDeploymentKey());
window.addEventListener(
  "pagehide",
  () => {
    detach();
    void bridge.dispose();
  },
  { once: true },
);
