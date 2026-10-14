import { z } from "zod";

export const EDITOR_BRIDGE_VERSION = 1;
const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const editorBridgeScopeSchema = z
  .object({
    deployment: z.string().min(1).max(1024),
    accountId: identifier,
    sessionId: identifier,
    workspaceId: identifier,
  })
  .strict();
export type EditorBridgeScope = z.infer<typeof editorBridgeScopeSchema>;
const envelope = {
  version: z.literal(EDITOR_BRIDGE_VERSION),
  instanceId: identifier,
  scope: editorBridgeScopeSchema,
};
export const editorBridgeRequestSchema = z
  .object({
    ...envelope,
    requestId: identifier,
    command: z.discriminatedUnion("type", [
      z
        .object({ type: z.literal("initialize"), sessionToken: z.string().min(1).max(4096) })
        .strict(),
      z.object({ type: z.literal("openPage"), pageId: identifier }).strict(),
      ...(["focus", "flushLocal", "close", "status"] as const).map((type) =>
        z.object({ type: z.literal(type) }).strict(),
      ),
    ]),
  })
  .strict();
export type EditorBridgeRequest = z.infer<typeof editorBridgeRequestSchema>;
export const editorBridgeStatusSchema = z
  .object({
    pageId: identifier.nullable(),
    state: z.enum(["closed", "connecting", "offline", "pending", "synchronized"]),
  })
  .strict();
export type EditorBridgeStatus = z.infer<typeof editorBridgeStatusSchema>;
const record = z
  .object({ kind: z.enum(["page", "database", "navigation"]), id: identifier })
  .strict();
export const editorBridgeMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...envelope,
      type: z.literal("response"),
      requestId: identifier,
      result: z.discriminatedUnion("ok", [
        z
          .object({
            ok: z.literal(true),
            status: editorBridgeStatusSchema,
            locallyFlushed: z.boolean().optional(),
          })
          .strict(),
        z
          .object({
            ok: z.literal(false),
            code: z.enum([
              "duplicate_request",
              "identity_mismatch",
              "not_initialized",
              "operation_failed",
            ]),
          })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({
      ...envelope,
      type: z.literal("event"),
      event: z.discriminatedUnion("type", [
        z.object({ type: z.literal("status"), status: editorBridgeStatusSchema }).strict(),
        z
          .object({
            type: z.literal("navigation"),
            target: z.object({ kind: z.enum(["page", "database"]), id: identifier }).strict(),
          })
          .strict(),
        z.object({ type: z.literal("changed"), records: z.array(record).min(1).max(256) }).strict(),
        z
          .object({
            type: z.literal("error"),
            code: z.enum(["authentication", "connection", "storage", "editor"]),
          })
          .strict(),
      ]),
    })
    .strict(),
]);
export type EditorBridgeMessage = z.infer<typeof editorBridgeMessageSchema>;
export type EditorBridgeEvent = Extract<EditorBridgeMessage, { type: "event" }>["event"];
export function sameEditorBridgeScope(left: EditorBridgeScope, right: EditorBridgeScope) {
  return (
    left.deployment === right.deployment &&
    left.accountId === right.accountId &&
    left.sessionId === right.sessionId &&
    left.workspaceId === right.workspaceId
  );
}
