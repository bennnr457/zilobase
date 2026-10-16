import { useSyncExternalStore } from "react";
import { CircleAlertIcon, Loader2Icon, RefreshCwIcon, WifiOffIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  useDatabaseEntityCommandState,
  useDatabaseInteractionRecovery,
} from "@zilobase/features/databases/react";

function subscribeConnectivity(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function DatabaseSaveStatus({ databaseId }: { databaseId: string }) {
  const state = useDatabaseEntityCommandState({ hostDatabaseId: databaseId });
  const recovery = useDatabaseInteractionRecovery();
  const online = useSyncExternalStore(
    subscribeConnectivity,
    () => navigator.onLine,
    () => true,
  );
  const message = !online
    ? "Offline — reconnect to save"
    : recovery.synchronizationError && !state.isPending
      ? "Saved — reload to refresh"
      : state.error?.name === "DatabaseCommandUnconfirmedError"
        ? "Save unconfirmed"
        : state.error
          ? `Save failed${state.isPending ? " · Saving other changes…" : " — try your edit again"}`
          : state.isPending
            ? "Saving…"
            : null;
  if (!message) return <span aria-hidden="true" className="mx-1 size-6 shrink-0" />;

  const hasError = Boolean(state.error || recovery.synchronizationError);
  const StatusIcon = !online
    ? WifiOffIcon
    : state.error || (recovery.synchronizationError && !state.isPending)
      ? CircleAlertIcon
      : Loader2Icon;

  return (
    <span className="mx-1 inline-flex shrink-0 items-center text-content-secondary">
      <span
        className="inline-flex size-6 items-center justify-center"
        role={hasError ? "alert" : "status"}
        title={state.error?.message ?? recovery.synchronizationError?.message ?? message}
      >
        <StatusIcon
          aria-hidden="true"
          className={StatusIcon === Loader2Icon ? "size-3.5 animate-spin" : "size-3.5"}
        />
        <span className="sr-only">{message}</span>
      </span>
      {online && recovery.hasUnconfirmed ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Retry save"
          title="Retry save"
          onClick={recovery.retry}
        >
          <RefreshCwIcon aria-hidden="true" className="size-4" />
        </Button>
      ) : null}
    </span>
  );
}
