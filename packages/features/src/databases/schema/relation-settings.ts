export function getRelationConfig(config: unknown): {
  limit?: "no_limit" | "one_page";
  relatedDatabaseId?: string;
  relatedDatabaseName?: string;
  relatedPageName?: string;
  relatedPropertyId?: string;
  relatedPropertyName?: string;
  syncStatus?: "not_synced" | "synced";
  twoWayRelation?: boolean;
} {
  const relation =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as { relation?: unknown }).relation
      : null;

  if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
    return {};
  }

  const relationConfig = relation as {
    limit?: unknown;
    relatedDatabaseId?: unknown;
    relatedDatabaseName?: unknown;
    relatedPageName?: unknown;
    relatedPropertyId?: unknown;
    relatedPropertyName?: unknown;
    syncStatus?: unknown;
    twoWayRelation?: unknown;
  };

  return {
    limit:
      relationConfig.limit === "one_page" || relationConfig.limit === "no_limit"
        ? relationConfig.limit
        : undefined,
    relatedDatabaseId:
      typeof relationConfig.relatedDatabaseId === "string"
        ? relationConfig.relatedDatabaseId
        : undefined,
    relatedDatabaseName:
      typeof relationConfig.relatedDatabaseName === "string"
        ? relationConfig.relatedDatabaseName
        : undefined,
    relatedPageName:
      typeof relationConfig.relatedPageName === "string"
        ? relationConfig.relatedPageName
        : undefined,
    relatedPropertyId:
      typeof relationConfig.relatedPropertyId === "string"
        ? relationConfig.relatedPropertyId
        : undefined,
    relatedPropertyName:
      typeof relationConfig.relatedPropertyName === "string"
        ? relationConfig.relatedPropertyName
        : undefined,
    syncStatus:
      relationConfig.syncStatus === "not_synced" || relationConfig.syncStatus === "synced"
        ? relationConfig.syncStatus
        : undefined,
    twoWayRelation:
      typeof relationConfig.twoWayRelation === "boolean"
        ? relationConfig.twoWayRelation
        : undefined,
  };
}
