import * as React from "react";
export function readActiveSidebarTab(workspaceId: string | null) {
  try {
    return window.localStorage.getItem(activeTabStorageKey(workspaceId)) ?? "home";
  } catch {
    return "home";
  }
}

export function writeActiveSidebarTab(workspaceId: string | null, tabId: string) {
  try {
    window.localStorage.setItem(activeTabStorageKey(workspaceId), tabId);
  } catch {
    // Selection still works for this session.
  }
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
      try {
        window.localStorage.setItem(storageKey, nextOpen ? "open" : "closed");
      } catch {
        // The section still remains interactive when storage is unavailable.
      }
    },
    [storageKey],
  );

  return [open, setOpen] as const;
}

function readSidebarSectionOpen(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) !== "closed";
  } catch {
    return true;
  }
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
  try {
    const value = storage?.getItem(key);
    const parsed = value ? JSON.parse(value) : null;
    const ids: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed?.version === 1
        ? parsed.expandedNodeIds
        : [];

    return [...new Set(ids.filter((id): id is string => typeof id === "string"))];
  } catch {
    return [];
  }
}

export function writeExpandedSidebarItems(
  key: string,
  ids: Iterable<string>,
  storage: StorageLike | null = getStorage(),
) {
  try {
    storage?.setItem(key, JSON.stringify([...ids].slice(0, 500)));
  } catch {
    // Navigation still works when local storage is unavailable.
  }
}

export function setSidebarItemExpanded(ids: ReadonlySet<string>, id: string, expanded: boolean) {
  const next = new Set(ids);
  expanded ? next.add(id) : next.delete(id);
  return next;
}

function getStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
