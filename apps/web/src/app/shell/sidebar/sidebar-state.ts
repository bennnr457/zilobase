import { Effect } from "effect";
import * as React from "react";
import {
  type SidebarSection,
  type SidebarSectionKind,
  type SidebarShortcut,
} from "@zilobase/features/user-settings";
import { libraryViewLabels } from "@/components/library/library-model";

export function getSidebarDatabaseViewSearchId({
  databaseId,
  databaseViewId,
  defaultDatabaseViewId,
  isDatabaseView,
}: {
  databaseId: string | null | undefined;
  databaseViewId: string | null | undefined;
  defaultDatabaseViewId: string | undefined;
  isDatabaseView: boolean | undefined;
}) {
  if (!databaseId || !isDatabaseView || !databaseViewId) {
    return undefined;
  }

  return databaseViewId === defaultDatabaseViewId ? undefined : databaseViewId;
}

export function readActiveSidebarTab(workspaceId: string | null) {
  return Effect.runSync(
    Effect.try({
      try: () => {
        return window.localStorage.getItem(activeTabStorageKey(workspaceId)) ?? "home";
      },
      catch: (error) => error,
    }).pipe(
      Effect.orElseSucceed(() => {
        return "home";
      }),
    ),
  );
}

export function writeActiveSidebarTab(workspaceId: string | null, tabId: string) {
  Effect.runSync(
    Effect.try({
      try: () => {
        window.localStorage.setItem(activeTabStorageKey(workspaceId), tabId);
      },
      catch: (error) => error,
    }).pipe(Effect.ignore),
  );
}

function activeTabStorageKey(workspaceId: string | null) {
  return `zilobase:sidebar-active-tab:${workspaceId ?? "default"}`;
}

export function useSidebarSectionOpen(storageKey: string) {
  const [open, setOpenState] = React.useState(() => readSidebarSectionOpen(storageKey));

  React.useEffect(() => {
    setOpenState(readSidebarSectionOpen(storageKey));
  }, [storageKey]);

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      setOpenState(nextOpen);
      Effect.runSync(
        Effect.try({
          try: () => {
            window.localStorage.setItem(storageKey, nextOpen ? "open" : "closed");
          },
          catch: (error) => error,
        }).pipe(Effect.ignore),
      );
    },
    [storageKey],
  );

  return [open, setOpen] as const;
}

function readSidebarSectionOpen(storageKey: string) {
  return Effect.runSync(
    Effect.try({
      try: () => {
        return window.localStorage.getItem(storageKey) !== "closed";
      },
      catch: (error) => error,
    }).pipe(
      Effect.orElseSucceed(() => {
        return true;
      }),
    ),
  );
}

const STORAGE_PREFIX = "zilobase:sidebar-tree:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function getSidebarExpansionStorageKey(
  workspaceId: string | null,
  section: "favorites" | "private" | "recents" | "team",
) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(workspaceId?.trim() || "default")}:${section}`;
}

export function readExpandedSidebarItems(key: string, storage: StorageLike | null = getStorage()) {
  return Effect.runSync(
    Effect.try({
      try: () => {
        const value = storage?.getItem(key);
        const parsed = value ? JSON.parse(value) : null;
        const ids: unknown[] = Array.isArray(parsed)
          ? parsed
          : parsed?.version === 1
            ? parsed.expandedNodeIds
            : [];

        return [...new Set(ids.filter((id): id is string => typeof id === "string"))];
      },
      catch: (error) => error,
    }).pipe(
      Effect.orElseSucceed(() => {
        return [];
      }),
    ),
  );
}

export function writeExpandedSidebarItems(
  key: string,
  ids: Iterable<string>,
  storage: StorageLike | null = getStorage(),
) {
  Effect.runSync(
    Effect.try({
      try: () => {
        storage?.setItem(key, JSON.stringify([...ids].slice(0, 500)));
      },
      catch: (error) => error,
    }).pipe(Effect.ignore),
  );
}

export function setSidebarItemExpanded(ids: ReadonlySet<string>, id: string, expanded: boolean) {
  const next = new Set(ids);
  expanded ? next.add(id) : next.delete(id);
  return next;
}

function getStorage(): StorageLike | null {
  return Effect.runSync(
    Effect.try({
      try: () => {
        return typeof window === "undefined" ? null : window.localStorage;
      },
      catch: (error) => error,
    }).pipe(
      Effect.orElseSucceed(() => {
        return null;
      }),
    ),
  );
}

export const sidebarSectionLabels: Record<SidebarSectionKind, string> = {
  aiChats: "AI chats",
  databaseView: "Database view",
  favorites: "Favorites",
  meetings: "Meetings",
  private: "Private",
  recents: "Recents",
  shared: "Shared",
  teamspaces: "Teamspaces",
  tasks: "Tasks",
};

export function getShortcutLabel(shortcut: SidebarShortcut) {
  if (shortcut.label) return shortcut.label;
  const target = shortcut.target;
  if (target.type === "action") {
    return target.action === "createPage"
      ? "New page"
      : target.action === "createDatabase"
        ? "New database"
        : "New AI chat";
  }
  if (target.type === "route") {
    return {
      ai: "Ask AI",
      meetings: "Meetings",
      settings: "Settings",
      tasks: "Tasks",
      trash: "Trash",
    }[target.route];
  }
  if (target.type === "library") return libraryViewLabels[target.view];
  return target.type === "page" ? "Page" : "Database";
}

export function isShortcutActive(
  shortcut: SidebarShortcut,
  pathname: string,
  search: Record<string, unknown>,
  settingsOpen = false,
) {
  const target = shortcut.target;
  if (target.type === "action") return false;
  if (target.type === "library") {
    return pathname === "/recents" && search.view === target.view;
  }
  if (target.type === "page") return pathname === `/p/${target.pageId}`;
  if (target.type === "database") {
    return (
      pathname === `/d/${target.databaseId}` && (!target.viewId || search.view === target.viewId)
    );
  }
  if (target.route === "settings") return settingsOpen;
  if (target.route === "meetings") {
    return pathname === "/recents" && search.view === "meetings";
  }
  if (target.route === "trash") {
    return pathname === "/recents" && search.view === "trash";
  }
  return pathname === `/${target.route}`;
}

export function getSectionLabel(section: SidebarSection) {
  return section.label || sidebarSectionLabels[section.kind];
}
