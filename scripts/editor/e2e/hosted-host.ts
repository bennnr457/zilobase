import { createZilobaseClient } from "@zilobase/features";
import {
  acceptEditorChangeNotification,
  pageQueryOptions,
  resolvePageDetailReference,
  type EditorBridgeMessage,
  type EditorBridgeRequest,
  type EditorBridgeScope,
} from "@zilobase/features/pages";
import { createApiAuthClient } from "@zilobase/features/auth";
const apiFetch = async <T>(path: string, input?: RequestInit) => {
  const result = await fetch(path, {
    ...input,
    headers: { Authorization: "Bearer native-secret" },
    credentials: "omit",
  });
  if (!result.ok) throw new Error("Request denied");
  return result.json() as Promise<T>;
};
const runtime = createZilobaseClient({ deployment: `${location.origin}|${location.origin}` });
runtime.queryClient.setQueryData(["session"], await createApiAuthClient(apiFetch).getSession());
let scope: EditorBridgeScope | null = null;
const messages: EditorBridgeMessage[] = [];
let requestId = 0;
const pending = new Map<string, (message: EditorBridgeMessage) => void>();
window.addEventListener("message", async (event) => {
  if (
    event.source !== document.querySelector("iframe")?.contentWindow ||
    event.origin !== location.origin
  )
    return;
  if (
    event.data.type === "ready" &&
    event.data.version === 1 &&
    event.data.deployment === `${location.origin}|${location.origin}`
  ) {
    scope = { deployment: event.data.deployment, accountId: "a", sessionId: "s", workspaceId: "w" };
    return;
  }
  messages.push(event.data);
  pending.get(event.data.requestId)?.(event.data);
  if (scope)
    await acceptEditorChangeNotification(
      runtime.queryClient,
      { instanceId: "native-editor", scope },
      event.data,
    );
});
Object.assign(window, {
  hostedReady: () => Boolean(scope),
  messages,
  async sendHosted(
    command: EditorBridgeRequest["command"],
    patch: Partial<EditorBridgeRequest> = {},
  ) {
    const id = `native-${++requestId}`;
    const result = new Promise<EditorBridgeMessage>((resolve) => pending.set(id, resolve));
    document
      .querySelector("iframe")!
      .contentWindow!.postMessage(
        { version: 1, instanceId: "native-editor", scope, requestId: id, command, ...patch },
        location.origin,
      );
    const message = await result;
    pending.delete(id);
    return message;
  },
  readNativePage: async () => {
    const reference = await runtime.queryClient.fetchQuery(pageQueryOptions(apiFetch, "p"));
    return resolvePageDetailReference(runtime.queryClient, reference)?.page.name;
  },
  nativeInvalidated: () => runtime.queryClient.getQueryState(["page", "p"])?.isInvalidated,
  nativeStillPresent: () => Boolean(runtime.queryClient.getQueryData(["session"])),
});
