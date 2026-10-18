import {
  sharingTarget,
  sharingLevel,
  sharingAuth,
  sharingResponse,
  sharingWrites,
} from "./sharing-api-fixture";
import { MeetingView } from "@/sections/pages/editor/extensions/meeting/components/meeting-view";
import type { MeetingCapturePhase } from "@/platform/meetings/capture-types";
import { installMeetingCaptureRuntime } from "@/platform/meetings/capture-runtime";
import { SharePopover } from "@/components/sharing/components/share-popover";
import { SettingsDialog } from "@/sections/settings/shell/components/settings-dialog";
import { ChatSidebarPanel } from "@/sections/ai/workspace/components/chat-sidebar";
import {
  GuestPageTitle,
  GuestPageActions,
  PublicPageBreadcrumb,
  PublicLoginButton,
} from "@/sections/pages/header/components/public-page-header";
import "@/styles/global.css";
import "@/styles/app.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from "@tanstack/react-router";
import {
  ZilobaseFeaturesProvider,
  type ApiFetcher,
  type ZilobaseAuthClient,
} from "@zilobase/features";
import { defaultUserSettings } from "@zilobase/features/user-settings";
import { PageLayout } from "@/sections/pages/layout/components/page-layout";
import {
  PageSidePaneContext,
  usePageSidePaneState,
} from "@/sections/pages/presentation/components/page-presentation";
import {
  PageSidePaneLayout,
  PageSidePaneShell,
} from "@/sections/pages/presentation/components/page-side-pane";
import { PageDialog } from "@/sections/pages/presentation/components/page-dialog";
import { useOpenEmbeddedPage } from "@/sections/pages/navigation/hooks/page-navigation";
import { PageEditorRegistryProvider } from "@/sections/pages/editor/runtime/components/page-editor-registry";
import {
  PageCommentsRegistryProvider,
  PageEditorCommentsProvider,
} from "@/sections/pages/editor/comments/components/comments-context";

import { PageDesignEditorProvider } from "@/sections/pages/design/components/page-design-editor";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ShortcutProvider } from "@/app/shortcuts/shortcut-provider";

const meetingFixture = new URLSearchParams(window.location.search).get("workspace") === "meeting";
const fixtureCaptureStatus = (phase: MeetingCapturePhase) => ({
  checkpointPath: null,
  elapsedMs: 0,
  error: null,
  meetingId: "fixture",
  phase,
  sampleRate: 48000,
});
if (meetingFixture)
  installMeetingCaptureRuntime({
    observe: (_id, observer) => {
      observer.setDevices([]);
      return () => {};
    },
    prepare: async () => {},
    cancelPreparation: async () => {},
    start: async () => fixtureCaptureStatus("recording"),
    pause: async () => fixtureCaptureStatus("paused"),
    resume: async () => fixtureCaptureStatus("recording"),
    stop: async () => fixtureCaptureStatus("stopped"),
    refreshTransport: async () => {},
    deleteLocalFile: async () => {},
    openLocalFile: async () => {},
  });
const fixtureAudience = new URLSearchParams(window.location.search).get("audience");
let settings = { ...defaultUserSettings };
const requests: string[] = [];
const writes: unknown[] = [];
const mounts: Record<string, number> = {};
const records = ["main", "child", "other"].map((id) => ({
  id,
  name: id,
  workspaceId: "workspace",
  type: "pageblock",
  url: "#",
  content: null,
  hasContent: false,
  metadata: {},
  isShared: false,
  isFavorite: false,
  deletedAt: null,
  createdAt: "2026-10-15T00:00:00Z",
  updatedAt: "2026-10-15T00:00:00Z",
}));
const apiFetch: ApiFetcher = async <T,>(path: string, options?: RequestInit) => {
  requests.push(path);
  if (meetingFixture && path === "/meetings/fixture")
    return {
      meeting: {
        id: "fixture",
        pageId: "main",
        notesPageId: "main",
        workspaceId: "workspace",
        title: "Meeting",
        status: "idle",
        language: "en",
        instructionsPreset: "auto",
        consentMessage: "Everyone must be notified.",
        autoPlayConsent: false,
        archiveLocalAudio: false,
        summaryGeneratedAt: null,
        summarySourceSegmentCount: 0,
      },
    } as T;
  const sharedResponse = sharingResponse(path, options);
  if (sharedResponse !== undefined) return sharedResponse as T;
  if (path === "/user-settings") {
    if (options?.method === "PATCH") {
      const patch = JSON.parse(String(options.body));
      writes.push(patch);
      settings = { ...settings, ...patch };
    }
    return { settings } as T;
  }
  if (path.includes("/bootstrap"))
    return {
      viewerType: "public",
      database: {
        id: "database",
        workspaceId: "workspace",
        pageId: null,
        name: "Rows",
        accessLevel: sharingTarget ? sharingLevel : "view",
        config: {},
        createdAt: records[0].createdAt,
        updatedAt: records[0].updatedAt,
        deletedAt: null,
        version: 1,
      },
      dataSources: [
        {
          id: "source",
          workspaceId: "workspace",
          parentDatabaseId: "database",
          name: "Rows",
          config: {},
          configVersion: 1,
          version: 1,
          position: 0,
          linkedAt: null,
          createdAt: records[0].createdAt,
          updatedAt: records[0].updatedAt,
        },
      ],
      properties: [],
      views: [
        {
          id: "view",
          databaseId: "database",
          dataSourceId: "source",
          name: "Rows",
          type: "table",
          position: 0,
          config: {},
          createdAt: records[0].createdAt,
          updatedAt: records[0].updatedAt,
        },
      ],
    } as T;
  if (path.includes("/records?"))
    return {
      queryHash: new URL(path, location.origin).searchParams.get("expectedQueryHash"),
      databaseVersion: 1,
      dataSourceVersion: 1,
      hasMore: false,
      offset: 0,
      snapshot: "fixture",
      totalCount: 2,
      records: records.slice(1).map((page, index) => ({
        id: `row-${page.id}`,
        pageId: page.id,
        dataSourceId: "source",
        orderKey: String(index),
        parentRowId: null,
        valuesByPropertyId: {},
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        page: {
          id: page.id,
          name: page.name,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
          deletedAt: null,
          hasContent: false,
          metadata: {},
        },
      })),
    } as T;
  if (path.startsWith("/pages?")) return { pages: records, databases: [], placements: [] } as T;
  if (path.startsWith("/teamspaces")) return { teamspaces: [] } as T;
  if (path.startsWith("/pages/"))
    return {
      page: records.find((item) => item.id === path.split("/")[2]),
      accessLevel: sharingTarget ? sharingLevel : "view",
      databaseIds: [],
    } as T;
  return {} as T;
};
const auth = {
  ...(sharingTarget
    ? sharingAuth
    : {
        getSession: async () => ({ user: null, session: null }),
        listWorkspaces: async () => [],
      }),
} as unknown as ZilobaseAuthClient;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Body({ id }: { id: string }) {
  const [draft, setDraft] = useState("");
  const instance = useRef(Math.random());
  const bodyState = new URLSearchParams(window.location.search).get("body");
  useEffect(() => {
    mounts[id] = (mounts[id] ?? 0) + 1;
  }, [id]);
  if (bodyState === "loading") return <p>Loading page...</p>;
  if (bodyState === "error") return <p role="alert">Page unavailable.</p>;
  return (
    <div className="p-6" data-editor-instance={instance.current}>
      <label>
        Draft {id}
        <input
          aria-label={`Draft ${id}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <div style={{ height: 1100 }}>Page content {id}</div>
    </div>
  );
}

function Content({ id }: { id: string }) {
  const state = usePageSidePaneState(id);
  const location = useLocation();
  const audience = fixtureAudience;
  useEffect(() => {
    Object.assign(window, { pageLayoutCommands: state });
  }, [state]);
  if (meetingFixture) {
    const fullPage = new URLSearchParams(window.location.search).has("full");
    const editable = !new URLSearchParams(window.location.search).has("readonly");
    const view = (
      <MeetingView
        meetingId="fixture"
        editable={editable}
        fullPage={fullPage}
        embeddedPage={{ id: "child", name: "Related page", emoji: null }}
      />
    );
    return (
      <PageSidePaneContext.Provider value={state}>
        {fullPage ? (
          <div className="p-4">{view}</div>
        ) : (
          <div className="tiptap-editor" style={{ padding: 16 }}>
            <div className="node-meetingBlock">
              <div data-node-view-wrapper>{view}</div>
            </div>
          </div>
        )}
      </PageSidePaneContext.Provider>
    );
  }
  if (sharingTarget)
    return (
      <div className="p-8">
        <SharePopover
          databaseId={sharingTarget === "database" ? "database" : undefined}
          pageId={sharingTarget === "page" ? "main" : undefined}
        />
      </div>
    );
  if (new URLSearchParams(window.location.search).get("workspace") === "settings")
    return <SettingsFixture />;
  return (
    <PageSidePaneContext.Provider value={state}>
      <div className="flex min-w-0 w-full flex-col">
        <Commands id={id} />
        <div data-fixture-path>{location.href}</div>
        <div style={{ height: 500 }} className="flex min-h-0 flex-col">
          <PageSidePaneShell
            open={state.sidePaneAnimatedOpen}
            visible={Boolean(state.renderedSidePanePageId)}
            body={
              <PageSidePaneLayout
                mainOwnsLayout
                main={
                  <PageLayout
                    pageId={id}
                    placement="main"
                    header={
                      audience === "public"
                        ? {
                            leadingControl: <PublicPageBreadcrumb pageId={id} />,
                            actions: <PublicLoginButton />,
                            showBreadcrumb: false,
                          }
                        : audience === "guest"
                          ? {
                              leadingControl: <GuestPageTitle pageId={id} />,
                              actions: <GuestPageActions />,
                              showBreadcrumb: false,
                            }
                          : undefined
                    }
                  >
                    <Body id={id} />
                  </PageLayout>
                }
                sidePane={
                  state.sidePaneContentReady && state.renderedSidePanePageId ? (
                    <PageLayout
                      pageId={state.renderedSidePanePageId}
                      placement="pane"
                      header={audience ? { leadingControl: null, showActions: false } : undefined}
                      rowNavigationDatabaseId={state.sidePaneDatabaseId}
                      onClose={state.closeSidePane}
                      onOpenFullPage={state.openSidePaneAsFullPage}
                    >
                      <Body id={state.renderedSidePanePageId} />
                    </PageLayout>
                  ) : null
                }
                sidePaneOpen={state.sidePaneAnimatedOpen}
                sidePaneVisible={Boolean(state.renderedSidePanePageId)}
              />
            }
          />
        </div>
        <PageDialog contextPageId={id} readOnly />
      </div>
    </PageSidePaneContext.Provider>
  );
}

function Commands({ id }: { id: string }) {
  const { openPage } = useOpenEmbeddedPage({ contextPageId: id, page: null });
  // Commands intentionally exercise both the preference policy and direct callers.
  const state = useContextState();
  useEffect(() => {
    Object.assign(window, { pageLayoutOpen: openPage });
  }, [openPage]);
  return (
    <div className="flex flex-wrap gap-2 p-2">
      <button onClick={() => openPage("child")}>Open child</button>
      <button onClick={() => openPage(id)}>Open current</button>
      <button onClick={() => state.openSidePane("child")}>Direct pane</button>
      <button onClick={() => state.openSidePane("child", { databaseId: "database" })}>
        Open row
      </button>
      <button onClick={() => state.openEmbeddedPageDialog("child")}>Direct dialog</button>
      <button
        onClick={() => {
          settings = { ...settings, embeddedItemsOpenAs: "dialog" };
          queryClient.setQueryData(["user-settings"], settings);
        }}
      >
        Prefer dialog
      </button>
    </div>
  );
}
import { usePageSidePane as useContextState } from "@/sections/pages/presentation/components/page-presentation";
function FixtureSidebar({ children }: { children: ReactNode }) {
  return fixtureAudience ? children : <SidebarProvider>{children}</SidebarProvider>;
}

function SettingsFixture() {
  const [section, setSection] = useState("security");
  const [open, setOpen] = useState(true);
  return (
    <>
      <SettingsDialog
        activeSection={section}
        onOpenChange={setOpen}
        onSectionChange={setSection}
        open={open}
      />
      {!open ? <button onClick={() => setOpen(true)}>Reopen settings</button> : null}
    </>
  );
}

function AiPresentationFixture() {
  const [mode, setMode] = useState<"sidebar" | "floating">("sidebar");
  const [open, setOpen] = useState(true);
  return (
    <div style={{ height: 600, maxWidth: 500 }}>
      {open ? (
        <ChatSidebarPanel
          onClose={() => setOpen(false)}
          onPresentationModeChange={setMode}
          presentationMode={mode}
        />
      ) : (
        <button onClick={() => setOpen(true)}>Reopen chat</button>
      )}
    </div>
  );
}

const root = createRootRoute({ component: () => <Outlet /> });
const routes = ["main", "child", "other"].map((id) =>
  createRoute({
    getParentRoute: () => root,
    path: `/p/${id}`,
    component: () => <Content id={id} />,
  }),
);
const initial = new URLSearchParams(window.location.search).get("target") ?? "/p/main";
const history = createMemoryHistory({ initialEntries: [initial] });
const router = createRouter({ routeTree: root.addChildren(routes), history });
Object.assign(window, {
  pageLayoutFixture: {
    mounts,
    requests,
    writes,
    sharingWrites,
    router,
    queryClient,
    settings: () => settings,
  },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ZilobaseFeaturesProvider
      value={{ deployment: "page-layout-test", queryClient, apiFetch, auth }}
    >
      <ShortcutProvider>
        <PageEditorRegistryProvider>
          <PageCommentsRegistryProvider>
            <PageEditorCommentsProvider>
              <PageDesignEditorProvider>
                <FixtureSidebar>
                  {new URLSearchParams(window.location.search).get("workspace") === "ai" ? (
                    <AiPresentationFixture />
                  ) : (
                    <RouterProvider router={router} />
                  )}
                </FixtureSidebar>
              </PageDesignEditorProvider>
            </PageEditorCommentsProvider>
          </PageCommentsRegistryProvider>
        </PageEditorRegistryProvider>
      </ShortcutProvider>
    </ZilobaseFeaturesProvider>
  </QueryClientProvider>,
);
