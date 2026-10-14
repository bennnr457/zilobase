import type { QueryClient } from "@tanstack/react-query";
import {
  editorBridgeMessageSchema,
  sameEditorBridgeScope,
  type EditorBridgeScope,
} from "./editor-bridge";

/** A native runtime only invalidates its own records after confirmed editor changes. */
export async function acceptEditorChangeNotification(
  queryClient: QueryClient,
  binding: { instanceId: string; scope: EditorBridgeScope },
  raw: unknown,
) {
  const parsed = editorBridgeMessageSchema.safeParse(raw);
  if (!parsed.success) return false;
  const message = parsed.data;
  if (
    message.instanceId !== binding.instanceId ||
    !sameEditorBridgeScope(message.scope, binding.scope) ||
    message.type !== "event" ||
    message.event.type !== "changed"
  )
    return false;
  const records = message.event.records;
  const contains = (value: unknown, id: string): boolean =>
    value === id ||
    (Array.isArray(value) && value.some((part) => contains(part, id))) ||
    (value !== null &&
      typeof value === "object" &&
      Object.values(value).some((part) => contains(part, id)));
  await queryClient.invalidateQueries({
    predicate: (query) =>
      records.some((record) =>
        contains(
          query.queryKey,
          record.kind === "navigation" ? binding.scope.workspaceId : record.id,
        ),
      ),
  });
  return true;
}
