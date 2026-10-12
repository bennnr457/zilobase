import type {
  LibraryView,
  SidebarSection,
  SidebarSectionKind,
  SidebarShortcut,
} from "@zilobase/features/user-settings";

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

export const libraryViewLabels: Record<LibraryView, string> = {
  skills: "Skills",
  instructions: "Instructions",
  favourites: "Favourites",
  meetings: "Meetings",
  private: "Private",
  recents: "Recents",
  shared: "Shared",
  teamspaces: "Teamspaces",
  trash: "Trash",
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

export {
  updateSidebarTab,
  hideUnconfiguredIntegrationTabs,
  restoreUnconfiguredIntegrationTabs,
  moveArrayItem,
  moveLayoutEntry,
  hasShortcutTarget,
} from "@zilobase/features/user-settings";
