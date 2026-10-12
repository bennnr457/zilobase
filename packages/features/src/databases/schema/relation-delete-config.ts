export function getRelationDeleteConfig(config: unknown) {
  const relation =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as { relation?: unknown }).relation
      : null;

  if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
    return {};
  }

  const relationConfig = relation as {
    relatedDatabaseId?: unknown;
    relatedPropertyId?: unknown;
  };

  return {
    relatedDatabaseId:
      typeof relationConfig.relatedDatabaseId === "string"
        ? relationConfig.relatedDatabaseId
        : undefined,
    relatedPropertyId:
      typeof relationConfig.relatedPropertyId === "string"
        ? relationConfig.relatedPropertyId
        : undefined,
  };
}
