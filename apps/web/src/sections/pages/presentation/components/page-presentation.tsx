import { usePageEditorRegistry } from "@/sections/pages/editor/runtime/components/page-editor-registry";
import { useLocation, useRouter } from "@tanstack/react-router";
import { Effect } from "effect";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { isMobileViewport, useIsMobile } from "@/hooks/use-mobile";
import type { EmbeddedItemsOpenAs } from "@zilobase/features/pages";

export type OpenPageSidePaneOptions = {
  databaseId?: string | null;
};

export type PageSidePaneContextValue = {
  closeEmbeddedPageDialog: () => void;
  closeSidePane: () => void;
  dialogDatabaseId: string | null;
  dialogPageId: string | null;
  embeddedItemsOpenAs: EmbeddedItemsOpenAs;
  mainHeader?: ReactNode;
  mainPaneNavigationActive: boolean;
  openEmbeddedPageDialog: (pageId: string, options?: OpenPageSidePaneOptions) => void;
  openDatabaseSidePane: (databaseId: string) => void;
  openDatabaseInMainPane: (databaseId: string) => void;
  openPageInMainPane: (pageId: string, options?: OpenPageSidePaneOptions) => void;
  openSidePaneAsFullPage: () => void;
  openSidePane: (pageId: string, options?: OpenPageSidePaneOptions) => void;
  renderedSidePaneDatabaseId: string | null;
  renderedSidePanePageId: string | null;
  sidePaneAnimatedOpen: boolean;
  sidePaneContentReady: boolean;
  sidePaneDatabaseId: string | null;
  sidePanePageId: string | null;
};

export const PageSidePaneContext = createContext<PageSidePaneContextValue | null>(null);

export const WORKSPACE_SIDE_PANE_TRANSITION_MS = 200;

export const SIDE_PANE_DEFAULT_WIDTH = "clamp(22rem, 50%, 48rem)";
export const SIDE_PANE_MIN_WIDTH = 320;
export const SIDE_PANE_MIN_MAIN_WIDTH = 256;
export const SIDE_PANE_READABLE_MIN_WIDTH = 352;
export const SIDE_PANE_KEYBOARD_RESIZE_STEP = 24;

const SIDE_PANE_PAGE_PARAM = "p";
const SIDE_PANE_DATABASE_PARAM = "d";

export const getFullPagePath = (pageId: string) => `/p/${encodeURIComponent(pageId)}`;

export const getFullDatabasePath = (databaseId: string) => `/d/${encodeURIComponent(databaseId)}`;

let promotedFullPagePath: string | null = null;
const promotedFullPageListeners = new Set<() => void>();

function setPromotedFullPagePath(path: string | null) {
  if (promotedFullPagePath === path) return;
  promotedFullPagePath = path;
  for (const listener of promotedFullPageListeners) listener();
}

export function clearPromotedFullPagePath() {
  setPromotedFullPagePath(null);
  document.querySelectorAll<HTMLElement>("[data-page-side-pane-shell]").forEach((shell) => {
    delete shell.dataset.pageSidePanePromoted;
    shell.style.setProperty("--page-side-pane-width", SIDE_PANE_DEFAULT_WIDTH);
  });
}

function promoteMountedSidePane(targetPath: string) {
  return Effect.gen(function* () {
    yield* Effect.sync(() => {
      const panel = document.querySelector<HTMLElement>("[data-page-side-pane-panel]");
      const shell = panel?.closest<HTMLElement>("[data-page-side-pane-shell]");
      if (shell) {
        shell.style.setProperty(
          "--page-side-pane-width",
          `${shell.getBoundingClientRect().width}px`,
        );
        shell.dataset.pageSidePanePromoted = "true";
      }
      setPromotedFullPagePath(targetPath);
    });
    // Preserve the live editor: router navigation would replace its route owner.
    yield* Effect.sync(() =>
      window.History.prototype.replaceState.call(
        window.history,
        window.history.state,
        "",
        targetPath,
      ),
    );
  });
}

export function usePromotedFullPagePath() {
  return useSyncExternalStore(
    (listener) => {
      promotedFullPageListeners.add(listener);
      return () => promotedFullPageListeners.delete(listener);
    },
    () => promotedFullPagePath,
    () => null,
  );
}

export function usePageSidePaneState(
  _resetKey?: string | null,
  embeddedItemsOpenAs: EmbeddedItemsOpenAs = "sidepanel",
): PageSidePaneContextValue {
  const router = useRouter();
  const isMobile = useIsMobile();
  const promotedFullPagePath = usePromotedFullPagePath();
  const location = useLocation({
    select: ({ hash, pathname, searchStr }) => ({
      hash,
      pathname,
      searchStr,
    }),
  });
  const sidePanePageId = getSearchParam(location.searchStr, SIDE_PANE_PAGE_PARAM);
  const sidePaneDatabaseId = getSearchParam(location.searchStr, SIDE_PANE_DATABASE_PARAM);
  const { getEditorHandle } = usePageEditorRegistry();
  const [dialogPageId, setDialogPageId] = useState<string | null>(null);
  const [dialogDatabaseId, setDialogDatabaseId] = useState<string | null>(null);
  const [renderedSidePanePageId, setRenderedSidePanePageId] = useState<string | null>(null);
  const [renderedSidePaneDatabaseId, setRenderedSidePaneDatabaseId] = useState<string | null>(null);
  const [sidePaneAnimatedOpen, setSidePaneAnimatedOpen] = useState(false);
  const [sidePaneContentReady, setSidePaneContentReady] = useState(false);
  const sidePaneWasOpenRef = useRef(false);
  const pendingMainPanePathRef = useRef<string | null>(null);
  const writeSidePaneParams = useCallback(
    (pageId: string | null, databaseId?: string | null, replace = false) => {
      const params = new URLSearchParams(location.searchStr);
      const databaseParam = getSidePaneDatabaseParam(location.pathname, databaseId);

      if (pageId) {
        params.set(SIDE_PANE_PAGE_PARAM, pageId);
      } else {
        params.delete(SIDE_PANE_PAGE_PARAM);
      }

      if (databaseParam) {
        params.set(SIDE_PANE_DATABASE_PARAM, databaseParam);
      } else {
        params.delete(SIDE_PANE_DATABASE_PARAM);
      }

      const search = params.toString();
      const hash = location.hash ? `#${location.hash}` : "";
      const path = `${location.pathname}${search ? `?${search}` : ""}${hash}`;

      if (path === `${location.pathname}${location.searchStr}${hash}`) {
        return;
      }

      if (replace) {
        router.history.replace(path);
        return;
      }

      router.history.push(path);
    },
    [location.hash, location.pathname, location.searchStr, router.history],
  );
  const closeSidePane = useCallback(() => {
    clearPromotedFullPagePath();
    writeSidePaneParams(null, null, true);
  }, [writeSidePaneParams]);
  const closeEmbeddedPageDialog = useCallback(() => {
    setDialogPageId(null);
    setDialogDatabaseId(null);
  }, []);
  const openSidePane = useCallback(
    (nextPageId: string, options?: OpenPageSidePaneOptions) => {
      Effect.runSync(
        Effect.sync(() => {
          if (isMobile || isMobileViewport()) {
            closeEmbeddedPageDialog();
            if (location.pathname !== getFullPagePath(nextPageId))
              router.history.push(getFullPagePath(nextPageId));
            return;
          }
          const existing = getEditorHandle(nextPageId);
          if (existing?.focus && sidePanePageId !== nextPageId && dialogPageId !== nextPageId) {
            existing.focus();
            return;
          }
          closeEmbeddedPageDialog();

          writeSidePaneParams(nextPageId, options?.databaseId);
        }),
      );
    },
    [
      getEditorHandle,
      sidePanePageId,
      dialogPageId,
      closeEmbeddedPageDialog,
      isMobile,
      location.pathname,
      router.history,
      writeSidePaneParams,
    ],
  );
  const openDatabaseSidePane = useCallback(
    (databaseId: string) => {
      Effect.runSync(
        Effect.sync(() => {
          closeEmbeddedPageDialog();

          if (isMobile || isMobileViewport()) {
            router.history.push(getFullDatabasePath(databaseId));
            return;
          }

          writeSidePaneParams(null, databaseId);
        }),
      );
    },
    [getEditorHandle, closeEmbeddedPageDialog, isMobile, router.history, writeSidePaneParams],
  );
  const openPageInMainPane = useCallback(
    (nextPageId: string, options?: OpenPageSidePaneOptions) => {
      Effect.runSync(
        Effect.sync(() => {
          if (isMobile || isMobileViewport()) {
            closeEmbeddedPageDialog();
            if (location.pathname !== getFullPagePath(nextPageId))
              router.history.push(getFullPagePath(nextPageId));
            return;
          }
          const existing = getEditorHandle(nextPageId);
          if (existing?.focus) {
            existing.focus();
            return;
          }
          closeEmbeddedPageDialog();

          pendingMainPanePathRef.current = getFullPagePath(nextPageId);
          writeSidePaneParams(nextPageId, options?.databaseId);
        }),
      );
    },
    [
      getEditorHandle,
      closeEmbeddedPageDialog,
      isMobile,
      location.pathname,
      router.history,
      writeSidePaneParams,
    ],
  );
  const openDatabaseInMainPane = useCallback(
    (databaseId: string) => {
      Effect.runSync(
        Effect.sync(() => {
          closeEmbeddedPageDialog();

          if (isMobile || isMobileViewport()) {
            router.history.push(getFullDatabasePath(databaseId));
            return;
          }

          pendingMainPanePathRef.current = getFullDatabasePath(databaseId);
          writeSidePaneParams(null, databaseId);
        }),
      );
    },
    [getEditorHandle, closeEmbeddedPageDialog, isMobile, router.history, writeSidePaneParams],
  );
  const openSidePaneAsFullPage = useCallback(() => {
    const targetPath = sidePanePageId
      ? getFullPagePath(sidePanePageId)
      : sidePaneDatabaseId
        ? getFullDatabasePath(sidePaneDatabaseId)
        : null;
    if (targetPath) Effect.runSync(promoteMountedSidePane(targetPath));
  }, [sidePaneDatabaseId, sidePanePageId]);
  const openEmbeddedPageDialog = useCallback(
    (nextPageId: string, options?: OpenPageSidePaneOptions) => {
      Effect.runSync(
        Effect.sync(() => {
          if (isMobile || isMobileViewport()) {
            closeEmbeddedPageDialog();
            if (location.pathname !== getFullPagePath(nextPageId))
              router.history.push(getFullPagePath(nextPageId));
            return;
          }
          const existing = getEditorHandle(nextPageId);
          if (existing?.focus && sidePanePageId !== nextPageId && dialogPageId !== nextPageId) {
            existing.focus();
            return;
          }

          closeSidePane();
          setDialogPageId(nextPageId);
          setDialogDatabaseId(options?.databaseId ?? null);
        }),
      );
    },
    [
      closeSidePane,
      closeEmbeddedPageDialog,
      getEditorHandle,
      sidePanePageId,
      dialogPageId,
      isMobile,
      location.pathname,
      router.history,
    ],
  );

  useEffect(() => {
    if (!isMobile && !isMobileViewport()) return;
    const target = dialogPageId ?? sidePanePageId;
    const targetPath = target
      ? getFullPagePath(target)
      : sidePaneDatabaseId
        ? getFullDatabasePath(sidePaneDatabaseId)
        : null;
    if (!targetPath) return;
    Effect.runSync(
      Effect.gen(function* () {
        yield* Effect.sync(closeEmbeddedPageDialog);
        yield* Effect.sync(clearPromotedFullPagePath);
        yield* Effect.sync(() => router.history.replace(targetPath));
      }),
    );
  }, [
    closeEmbeddedPageDialog,
    dialogPageId,
    isMobile,
    router.history,
    sidePaneDatabaseId,
    sidePanePageId,
  ]);

  useEffect(() => {
    const sidePaneTargetKey = sidePanePageId
      ? `page:${sidePanePageId}`
      : sidePaneDatabaseId
        ? `database:${sidePaneDatabaseId}`
        : null;

    if (!sidePaneTargetKey) {
      sidePaneWasOpenRef.current = false;
      setSidePaneContentReady(false);
      setSidePaneAnimatedOpen(false);

      const timer = window.setTimeout(() => {
        setRenderedSidePanePageId(null);
        setRenderedSidePaneDatabaseId(null);
      }, WORKSPACE_SIDE_PANE_TRANSITION_MS);

      return () => {
        window.clearTimeout(timer);
      };
    }

    const isAlreadyOpen = sidePaneWasOpenRef.current;

    setRenderedSidePanePageId(sidePanePageId);
    setRenderedSidePaneDatabaseId(sidePanePageId ? null : sidePaneDatabaseId);
    sidePaneWasOpenRef.current = true;

    if (isAlreadyOpen) {
      setSidePaneAnimatedOpen(true);
      setSidePaneContentReady(true);
      return;
    }

    setSidePaneContentReady(false);
    setSidePaneAnimatedOpen(false);

    let cancelled = false;
    let openFrame = 0;
    let settleFrame = 0;

    openFrame = requestAnimationFrame(() => {
      settleFrame = requestAnimationFrame(() => {
        if (!cancelled) {
          setSidePaneAnimatedOpen(true);
          setSidePaneContentReady(true);
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(openFrame);
      cancelAnimationFrame(settleFrame);
    };
  }, [sidePaneDatabaseId, sidePanePageId]);

  useLayoutEffect(() => {
    const targetPath = pendingMainPanePathRef.current;
    const renderedTargetPath = renderedSidePanePageId
      ? getFullPagePath(renderedSidePanePageId)
      : renderedSidePaneDatabaseId
        ? getFullDatabasePath(renderedSidePaneDatabaseId)
        : null;

    if (!targetPath || targetPath !== renderedTargetPath) return;

    const panel = document.querySelector<HTMLElement>("[data-page-side-pane-panel]");
    const shell = panel?.closest<HTMLElement>("[data-page-side-pane-shell]");
    if (!shell) return;

    pendingMainPanePathRef.current = null;
    Effect.runSync(promoteMountedSidePane(targetPath));
  }, [renderedSidePaneDatabaseId, renderedSidePanePageId]);

  return useMemo<PageSidePaneContextValue>(
    () => ({
      closeEmbeddedPageDialog,
      closeSidePane,
      dialogDatabaseId,
      dialogPageId,
      embeddedItemsOpenAs,
      mainPaneNavigationActive: Boolean(promotedFullPagePath || pendingMainPanePathRef.current),
      openEmbeddedPageDialog,
      openDatabaseInMainPane,
      openDatabaseSidePane,
      openPageInMainPane,
      openSidePaneAsFullPage,
      openSidePane,
      renderedSidePaneDatabaseId,
      renderedSidePanePageId,
      sidePaneAnimatedOpen,
      sidePaneContentReady,
      sidePaneDatabaseId,
      sidePanePageId,
    }),
    [
      closeEmbeddedPageDialog,
      closeSidePane,
      dialogDatabaseId,
      dialogPageId,
      embeddedItemsOpenAs,
      promotedFullPagePath,
      openEmbeddedPageDialog,
      openDatabaseInMainPane,
      openDatabaseSidePane,
      openPageInMainPane,
      openSidePaneAsFullPage,
      openSidePane,
      renderedSidePaneDatabaseId,
      renderedSidePanePageId,
      sidePaneAnimatedOpen,
      sidePaneContentReady,
      sidePaneDatabaseId,
      sidePanePageId,
    ],
  );
}

function getSearchParam(search: string, key: string) {
  return new URLSearchParams(search).get(key)?.trim() || null;
}

export function getSidePaneDatabaseParam(pathname: string, databaseId?: string | null) {
  if (!databaseId) {
    return null;
  }

  const routeDatabaseId = pathname.match(/^\/d\/([^/]+)/)?.[1];
  if (!routeDatabaseId) {
    return databaseId;
  }

  return decodeURIComponent(routeDatabaseId) === databaseId ? null : databaseId;
}

export function PageSidePaneProvider({
  children,
  embeddedItemsOpenAs = "sidepanel",
  resetKey,
}: {
  children: ReactNode;
  embeddedItemsOpenAs?: EmbeddedItemsOpenAs;
  resetKey?: string | null;
}) {
  const sidePaneContext = usePageSidePaneState(resetKey, embeddedItemsOpenAs);

  return (
    <PageSidePaneContext.Provider value={sidePaneContext}>{children}</PageSidePaneContext.Provider>
  );
}

export function usePageSidePane() {
  const context = useContext(PageSidePaneContext);

  if (!context) {
    throw new Error("usePageSidePane must be used inside a side pane provider");
  }

  return context;
}

export function useOptionalPageSidePane() {
  return useContext(PageSidePaneContext);
}
