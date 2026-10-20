import type { DatabaseHostEntity } from "../core/entities";

export function isDatabaseLocked(database: { config?: unknown } | null | undefined) {
  if (!database?.config || typeof database.config !== "object" || Array.isArray(database.config)) {
    return false;
  }

  return (database.config as { locked?: unknown }).locked === true;
}

export function getDatabaseEmoji(database: { config?: unknown }) {
  const config = database.config;

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const emoji = (config as { emoji?: unknown }).emoji;

  return typeof emoji === "string" && emoji.length > 0 ? emoji : null;
}

export function getDatabaseCover(database: Pick<DatabaseHostEntity, "config">) {
  if (!database.config || typeof database.config !== "object" || Array.isArray(database.config)) {
    return null;
  }

  const cover = (database.config as { cover?: unknown }).cover;

  return typeof cover === "string" && cover.length > 0 ? cover : null;
}

export function getDatabaseDescription(database: { config?: unknown } | null | undefined) {
  if (!database?.config || typeof database.config !== "object" || Array.isArray(database.config)) {
    return "";
  }

  const description = (database.config as { description?: unknown }).description;

  return typeof description === "string" ? description : "";
}

/** Resolve a heading from authorized sources, following the selected/default view. */
export function getDatabaseTitleSource<T extends { id: string; position?: number }>(
  dataSources: readonly T[],
  views: readonly { id: string; dataSourceId: string; position?: number }[],
  viewId?: string | null,
): T | null {
  const orderedViews = [...views].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id),
  );
  const selectedView = orderedViews.find((view) => view.id === viewId) ?? orderedViews[0];
  return (
    dataSources.find((source) => source.id === selectedView?.dataSourceId) ??
    [...dataSources].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id),
    )[0] ??
    null
  );
}
