import { parsePropertyValue } from "@zilobase/page-context";
import { prepareSearchChunk, searchSafeText, splitSearchText } from "./chunking";
import type { PreparedSearchChunk } from "./vector-contracts";

export type StoredSearchProperty = {
  id: string;
  name: string;
  type: string;
  config: unknown;
  value: unknown;
  definitionRevision: string;
  valueRevision: string;
};
export const SEARCH_PROPERTY_TYPES = new Set([
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "id",
]);
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export function serializeSearchProperty(property: StoredSearchProperty): string {
  if (!SEARCH_PROPERTY_TYPES.has(property.type) || property.value == null) return "";
  const parsed = parsePropertyValue(property.value, property.type);
  let values = Array.isArray(parsed) ? parsed : [parsed];
  if (["select", "multi_select", "status"].includes(property.type)) {
    const options = record(property.config)?.options;
    const labels = new Map(
      (Array.isArray(options) ? options : []).flatMap((option) => {
        const item = record(option);
        return item && typeof item.id === "string" && typeof item.name === "string"
          ? [[item.id, item.name] as const]
          : [];
      }),
    );
    // Deleted or unknown option IDs are not useful text and must not survive as stale labels.
    values = values.flatMap((value) => (labels.has(value) ? [labels.get(value)!] : []));
  } else if (property.type === "number") {
    values = values.flatMap((value) =>
      value.trim() && Number.isFinite(Number(value)) ? [String(Number(value))] : [],
    );
  } else if (property.type === "checkbox") {
    values = values.flatMap((value) =>
      ["true", "false"].includes(value) ? [value === "true" ? "checked" : "unchecked"] : [],
    );
  }
  return searchSafeText(
    values.filter((value) => value.trim()).join(property.type === "date" ? " to " : ", "),
  );
}

export function chunkStoredProperties(
  title: string,
  properties: readonly StoredSearchProperty[],
): PreparedSearchChunk[] {
  const seen = new Set<string>();
  return [...properties]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((property) => {
      if (seen.has(property.id)) return [];
      seen.add(property.id);
      const value = serializeSearchProperty(property);
      if (!value) return [];
      const label = searchSafeText(property.name);
      return splitSearchText(value).map((piece, index) =>
        prepareSearchChunk(title, piece.text, "property", property.id, index, {
          headingPath: splitSearchText(label, 500, 0)
            .slice(0, 1)
            .map((item) => item.text),
          propertyId: property.id,
          definitionRevision: property.definitionRevision,
          valueRevision: property.valueRevision,
          start: piece.start,
          end: piece.end,
        }),
      );
    });
}
