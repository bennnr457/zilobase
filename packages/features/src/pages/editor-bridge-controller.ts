import {
  EDITOR_BRIDGE_VERSION,
  editorBridgeRequestSchema,
  sameEditorBridgeScope,
  type EditorBridgeScope,
  type EditorBridgeStatus,
  type EditorBridgeMessage,
  type EditorBridgeEvent,
} from "./editor-bridge";

export type EditorBridgeAdapter = {
  initialize: (scope: EditorBridgeScope, sessionToken: string) => Promise<void>;
  openPage: (pageId: string) => Promise<void>;
  focus: () => void;
  flushLocal: () => Promise<void>;
  close: () => Promise<void>;
  status: () => EditorBridgeStatus;
};

/** Serial commands and identity teardown; editor implementation belongs to its host. */
export function createEditorBridge(
  adapter: EditorBridgeAdapter,
  send: (message: EditorBridgeMessage) => void,
) {
  let binding: { instanceId: string; scope: EditorBridgeScope } | null = null;
  let hostInstance: string | null = null;
  let lastSequence = 0;
  let tail: Promise<unknown> = Promise.resolve();
  let disposed = false;
  return {
    receive(raw: unknown): Promise<boolean> {
      const parsed = editorBridgeRequestSchema.safeParse(raw);
      if (!parsed.success || disposed) return Promise.resolve(false);
      const request = parsed.data;
      const task = tail.then(async () => {
        if (disposed) return false;
        const reply = (result: Extract<EditorBridgeMessage, { type: "response" }>["result"]) =>
          send({
            version: EDITOR_BRIDGE_VERSION,
            instanceId: request.instanceId,
            scope: request.scope,
            requestId: request.requestId,
            type: "response",
            result,
          });
        if (hostInstance !== null && hostInstance !== request.instanceId) {
          binding = null;
          await adapter.close().catch(() => undefined);
          reply({ ok: false, code: "identity_mismatch" });
          return false;
        }
        if (request.sequence <= lastSequence) {
          reply({ ok: false, code: "duplicate_request" });
          return false;
        }
        hostInstance ??= request.instanceId;
        lastSequence = request.sequence;
        const matches =
          binding &&
          binding.instanceId === request.instanceId &&
          sameEditorBridgeScope(binding.scope, request.scope);
        if (request.command.type !== "initialize" && !matches) {
          const hadBinding = Boolean(binding);
          binding = null;
          if (hadBinding) await adapter.close().catch(() => undefined);
          reply({ ok: false, code: hadBinding ? "identity_mismatch" : "not_initialized" });
          return false;
        }
        try {
          let locallyFlushed: boolean | undefined;
          switch (request.command.type) {
            case "initialize":
              binding = null;
              await adapter.close();
              await adapter.initialize(request.scope, request.command.sessionToken);
              binding = { instanceId: request.instanceId, scope: request.scope };
              break;
            case "openPage":
              await adapter.openPage(request.command.pageId);
              break;
            case "focus":
              adapter.focus();
              break;
            case "flushLocal":
              await adapter.flushLocal();
              locallyFlushed = true;
              break;
            case "close":
              binding = null;
              await adapter.close();
              break;
            case "status":
              break;
          }
          reply({
            ok: true,
            status: adapter.status(),
            ...(locallyFlushed ? { locallyFlushed } : {}),
          });
          return true;
        } catch {
          // Raw adapter errors may contain transport credentials or backend details.
          if (request.command.type === "initialize") {
            binding = null;
            await adapter.close().catch(() => undefined);
          }
          reply({ ok: false, code: "operation_failed" });
          return false;
        }
      });
      tail = task.catch(() => undefined);
      return task;
    },
    notify(event: EditorBridgeEvent) {
      if (binding && !disposed)
        send({ ...binding, version: EDITOR_BRIDGE_VERSION, type: "event", event });
    },
    async dispose() {
      disposed = true;
      binding = null;
      await tail;
      await adapter.close().catch(() => undefined);
      hostInstance = null;
      lastSequence = 0;
    },
  };
}
