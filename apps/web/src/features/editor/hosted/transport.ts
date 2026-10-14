import { EDITOR_BRIDGE_VERSION, type EditorBridgeMessage } from "@zilobase/features/pages";

declare global {
  interface Window {
    ZilobaseHostedEditor?: { receive: (message: unknown) => Promise<boolean> };
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export function sendEditorHostMessage(
  message: EditorBridgeMessage | { type: "ready"; version: number; deployment: string },
) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  else if (window.parent !== window) window.parent.postMessage(message, window.location.origin);
}
export function installEditorHostTransport(
  receive: (message: unknown) => Promise<boolean>,
  deployment: string,
) {
  const listener = (event: MessageEvent) => {
    if (
      event.source === window.parent &&
      event.origin === window.location.origin &&
      window.parent !== window
    )
      void receive(event.data);
  };
  window.ZilobaseHostedEditor = { receive };
  window.addEventListener("message", listener);
  sendEditorHostMessage({ type: "ready", version: EDITOR_BRIDGE_VERSION, deployment });
  return () => {
    window.removeEventListener("message", listener);
    delete window.ZilobaseHostedEditor;
  };
}
