import type {
  AutomationValueExpression,
  DatabaseAutomationCatalog,
  AutomationJsonValue,
} from "./contracts";
type CatalogProperty = DatabaseAutomationCatalog["properties"][number];

export function defaultReference(
  reference: string,
): Extract<AutomationValueExpression, { type: "reference" }> {
  if (reference === "trigger_property") return { propertyId: "", reference, type: "reference" };
  if (reference === "variable") return { name: "", reference, type: "reference" };
  if (reference === "action_output")
    return { actionId: "", output: "value", reference, type: "reference" };
  if (reference === "selected_person") return { reference, type: "reference", userId: "" };
  if (reference === "selected_page") return { pageId: "", reference, type: "reference" };
  if (reference === "selected_group") return { groupId: "", reference, type: "reference" };
  if (reference === "selected_teamspace") return { reference, teamspaceId: "", type: "reference" };
  return {
    reference: reference as
      | "trigger_page"
      | "trigger_person"
      | "page_creator"
      | "page_last_editor"
      | "now"
      | "today",
    type: "reference",
  };
}

export function expressionForMode(
  mode: "formula" | "literal" | "mention",
): AutomationValueExpression {
  return mode === "formula"
    ? { expression: "", type: "formula" }
    : mode === "mention"
      ? { reference: "now", type: "reference" }
      : { type: "literal", value: "" };
}

export function allProperties(
  catalog: DatabaseAutomationCatalog | undefined,
  dataSourceId: string,
): CatalogProperty[] {
  const source = catalog?.dataSources.find(({ id }) => id === dataSourceId);
  const properties =
    source?.properties ?? (dataSourceId === catalog?.dataSourceId ? catalog.properties : []);
  return [
    {
      id: "name",
      name: "Name",
      operators: [
        "was_edited",
        "is",
        "is_not",
        "contains",
        "does_not_contain",
        "starts_with",
        "ends_with",
        "is_empty",
        "is_not_empty",
      ],
      options: [],
      type: "title",
      writable: true,
    },
    ...properties,
  ];
}

export function writableProperties(
  catalog: DatabaseAutomationCatalog | undefined,
  dataSourceId: string,
) {
  return allProperties(catalog, dataSourceId).filter(({ writable }) => writable);
}

export function relationProperties(
  catalog: DatabaseAutomationCatalog | undefined,
  dataSourceId: string,
) {
  return allProperties(catalog, dataSourceId).filter(({ type }) => type === "relation");
}

export function propertyById(
  catalog: DatabaseAutomationCatalog | undefined,
  dataSourceId: string,
  propertyId: string,
) {
  return allProperties(catalog, dataSourceId).find(({ id }) => id === propertyId);
}

export function parseLiteral(value: string): AutomationJsonValue {
  const trimmed = value.trim();
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed && Number.isFinite(Number(trimmed))) return Number(trimmed);
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return JSON.parse(trimmed) as AutomationJsonValue;
    } catch {
      /* retain text */
    }
  }
  return value;
}

export function formatLiteral(value: AutomationJsonValue) {
  return typeof value === "string"
    ? value
    : value === null
      ? "null"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
}

export function entityIds(value: AutomationJsonValue): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) =>
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    "id" in item &&
    typeof item.id === "string"
      ? [item.id]
      : [],
  );
}

export function toggleEntityList(
  value: AutomationJsonValue,
  entityType: "option" | "user",
  id: string,
): AutomationJsonValue {
  const selected = new Set(entityIds(value));
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  return [...selected].map((itemId) => ({ entityType, id: itemId, type: "entity" }));
}
