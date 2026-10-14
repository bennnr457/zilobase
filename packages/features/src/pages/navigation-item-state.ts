import type { DatabaseRecord } from "../databases/index";
import { isDatabaseLocked } from "../databases/views/appearance";
import type { AccessLevel, Page } from "./contracts";

type NavigationItem = {
  database?: DatabaseRecord;
  databaseId?: string | null;
  meetingId?: string | null;
  page?: Page | null;
  listedPage?: Page;
  pageAccessLevel?: AccessLevel | null;
};

export function getNavigationItemState(item: NavigationItem) {
  return {
    displayName: getDisplayName(item),
    isFavorite: getFavorite(item),
    lockLabel: getLockLabel(item),
    locked: getLocked(item),
    canToggleLock: canToggleLock(item),
  };
}

function getDisplayName(item: NavigationItem) {
  return (item.databaseId ? item.database?.name : item.page?.name)?.trim() || "Untitled";
}

function getFavorite(item: NavigationItem) {
  return item.databaseId
    ? Boolean(item.database?.isFavorite)
    : Boolean(item.page?.isFavorite ?? item.listedPage?.isFavorite);
}

function getLockLabel(item: NavigationItem) {
  if (item.meetingId) return "Lock meeting";
  return item.databaseId ? "Lock database" : "Lock page";
}

function getLocked(item: NavigationItem) {
  if (item.meetingId) return item.page?.metadata?.meetingLocked === true;
  if (item.databaseId) return isDatabaseLocked(item.database);
  return item.page?.metadata?.locked === true;
}

function canEdit(level: string | null | undefined) {
  return level === "edit" || level === "full";
}

function canToggleLock(item: NavigationItem) {
  return (
    Boolean(item.databaseId && canEdit(item.database?.accessLevel)) || canEdit(item.pageAccessLevel)
  );
}
