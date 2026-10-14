import type { ClientLifecycle } from "@zilobase/features";
import { onlineManager } from "@tanstack/react-query";

export type ConnectivityState = "online" | "offline";

/** Browser connectivity for cached reads and the bounded online page edit window. */
export function getConnectivityState(): ConnectivityState {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }
  if (onlineManager.isOnline() === false) {
    return "offline";
  }
  return "online";
}

export function subscribeConnectivity(listener: () => void) {
  const unsubscribeOnlineManager = onlineManager.subscribe(listener);
  if (typeof window === "undefined") {
    return unsubscribeOnlineManager;
  }
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
    unsubscribeOnlineManager();
  };
}

export const webClientLifecycle: ClientLifecycle = {
  isOnline: () => navigator.onLine !== false,
  isVisible: () => document.visibilityState !== "hidden",
  subscribe(listener) {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    document.addEventListener("visibilitychange", listener);
    return () => {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
      document.removeEventListener("visibilitychange", listener);
    };
  },
};
