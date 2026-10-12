import type { ClientLifecycle } from "@zilobase/features";

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

export function databasePresenceColor(value: string) {
  const colors = ["blue", "purple", "pink", "orange", "green", "yellow", "red", "brown"];
  let hash = 0;
  for (let index = 0; index < value.length; index++)
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return `var(--editor-${colors[hash % colors.length]})`;
}
