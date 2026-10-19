import * as Y from "yjs";
import { COMMENT_THREADS_FIELD } from "../persistence/document-persistence";
import { FIELD_NAME } from "./document-codec";
export function assertCommentOnlyCollaborationUpdate(document: Y.Doc, update: Uint8Array) {
  const before = serializeProtectedCollaborationFields(document);
  const candidate = new Y.Doc();

  try {
    // Establish the concrete shared-type constructors before replaying updates.
    // Yjs otherwise materializes unknown fields as a generic AbstractType whose
    // JSON representation cannot be used for a permission comparison.
    candidate.getXmlFragment(FIELD_NAME);
    candidate.getMap(COMMENT_THREADS_FIELD);
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(document));
    Y.applyUpdate(candidate, update);

    if (serializeProtectedCollaborationFields(candidate) !== before) {
      throw new Error("Comment access cannot modify page content");
    }
  } finally {
    candidate.destroy();
  }
}

export function serializeProtectedCollaborationFields(document: Y.Doc) {
  return JSON.stringify(
    [...document.share.entries()]
      .filter(([field]) => field !== COMMENT_THREADS_FIELD)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, value]) => [
        field,
        stableJsonValue(
          field === FIELD_NAME ? document.getXmlFragment(FIELD_NAME).toJSON() : value.toJSON(),
        ),
      ]),
  );
}

export function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}
