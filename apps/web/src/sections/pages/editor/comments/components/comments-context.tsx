import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { PageCommentController } from "../lib/yjs-comments";
import { useZilobaseFeatures } from "@zilobase/features";
import { sharedClient } from "@zilobase/features/data";

type Registry = {
  requestFocus: (pageId: string) => void;
  focusRequested: (pageId: string) => boolean;
  consumeFocus: (pageId: string) => void;
  get: (pageId: string) => PageCommentController | null;
  register: (pageId: string, controller: PageCommentController) => () => void;
  subscribe: (pageId: string, listener: () => void) => () => void;
};

const PageCommentsRegistryContext = createContext<Registry | null>(null);

export function PageCommentsRegistryProvider({ children }: { children: ReactNode }) {
  const { queryClient } = useZilobaseFeatures();
  const client = sharedClient(queryClient);
  const focusRequests = useRef(new Map<string, ReturnType<typeof client.capture>>());
  const controllers = useRef(new Map<string, PageCommentController>());
  const listeners = useRef(new Map<string, Set<() => void>>());

  const notify = useCallback((pageId: string) => {
    listeners.current.get(pageId)?.forEach((listener) => listener());
  }, []);
  const get = useCallback((pageId: string) => controllers.current.get(pageId) ?? null, []);
  const register = useCallback(
    (pageId: string, controller: PageCommentController) => {
      controllers.current.set(pageId, controller);
      notify(pageId);
      return () => {
        if (controllers.current.get(pageId) === controller) {
          controllers.current.delete(pageId);
          notify(pageId);
        }
      };
    },
    [notify],
  );
  const subscribe = useCallback((pageId: string, listener: () => void) => {
    const pageListeners = listeners.current.get(pageId) ?? new Set();
    pageListeners.add(listener);
    listeners.current.set(pageId, pageListeners);
    return () => {
      pageListeners.delete(listener);
      if (pageListeners.size === 0) listeners.current.delete(pageId);
    };
  }, []);
  const value = useMemo(
    () => ({
      get,
      register,
      subscribe,
      requestFocus: (pageId: string) => {
        focusRequests.current.clear();
        focusRequests.current.set(pageId, client.capture());
        notify(pageId);
      },
      focusRequested: (pageId: string) => {
        const read = focusRequests.current.get(pageId);
        return Boolean(read && client.isCurrent(read));
      },
      consumeFocus: (pageId: string) => {
        focusRequests.current.delete(pageId);
        notify(pageId);
      },
    }),
    [get, register, subscribe, notify, client],
  );

  return (
    <PageCommentsRegistryContext.Provider value={value}>
      {children}
    </PageCommentsRegistryContext.Provider>
  );
}

export function usePageCommentsRegistry() {
  const registry = useContext(PageCommentsRegistryContext);
  if (!registry) throw new Error("PageCommentsRegistryProvider is missing");
  return registry;
}

export function useOptionalPageCommentsRegistry() {
  return useContext(PageCommentsRegistryContext);
}

export function usePageCommentFocusRequest(pageId?: string | null) {
  const registry = useContext(PageCommentsRegistryContext);
  const requested = useSyncExternalStore(
    useCallback(
      (listener) => (pageId && registry ? registry.subscribe(pageId, listener) : () => {}),
      [pageId, registry],
    ),
    () => Boolean(pageId && registry?.focusRequested(pageId)),
    () => false,
  );
  return {
    requested,
    consume: () => {
      if (pageId) registry?.consumeFocus(pageId);
    },
  };
}

export function usePageCommentController(pageId?: string | null) {
  const registry = usePageCommentsRegistry();
  return useSyncExternalStore(
    useCallback(
      (listener) => (pageId ? registry.subscribe(pageId, listener) : () => undefined),
      [pageId, registry],
    ),
    useCallback(() => (pageId ? registry.get(pageId) : null), [pageId, registry]),
    () => null,
  );
}

export function usePageCommentsSnapshot(pageId?: string | null) {
  const controller = usePageCommentController(pageId);
  return useSyncExternalStore(
    useCallback((listener) => controller?.subscribe(listener) ?? (() => undefined), [controller]),
    useCallback(() => controller?.getSnapshot() ?? EMPTY_SNAPSHOT, [controller]),
    () => EMPTY_SNAPSHOT,
  );
}

const EMPTY_SNAPSHOT = { activeThreadId: null, threads: [] } as const;

type PageEditorCommentsContextValue = {
  editorCommentsOpenRequest: number;
  requestEditorComments: () => void;
};

const PageEditorCommentsContext = createContext<PageEditorCommentsContextValue | null>(null);

export function PageEditorCommentsProvider({ children }: { children: ReactNode }) {
  const [editorCommentsOpenRequest, setEditorCommentsOpenRequest] = useState(0);

  const requestEditorComments = useCallback(() => {
    setEditorCommentsOpenRequest((count) => count + 1);
  }, []);
  const value = useMemo(
    () => ({
      editorCommentsOpenRequest,
      requestEditorComments,
    }),
    [editorCommentsOpenRequest, requestEditorComments],
  );

  return (
    <PageEditorCommentsContext.Provider value={value}>
      {children}
    </PageEditorCommentsContext.Provider>
  );
}

export function usePageEditorComments() {
  const context = useContext(PageEditorCommentsContext);

  if (!context) {
    throw new Error("usePageEditorComments must be used within PageEditorCommentsProvider");
  }

  return context;
}

export function useOptionalPageEditorComments() {
  return useContext(PageEditorCommentsContext);
}
