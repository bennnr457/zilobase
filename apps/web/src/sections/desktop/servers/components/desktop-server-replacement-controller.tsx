import { Cause, Effect } from "effect";
import { createDesktopServerReplacementDependencies } from "@/app/desktop-session";
import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { getApiErrorMessage } from "@/platform/network/api";
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/platform/diagnostics/desktop-diagnostics";
import {
  discardDesktopServerCandidate,
  desktopServersReferToSameInstance,
  getSelectedDesktopServer,
  prepareDesktopServerCandidate,
  type PreparedDesktopServer,
} from "@/platform/server/desktop-server";
import {
  subscribeDesktopServerReplacement,
  type DesktopServerReplacementRequest,
} from "@/platform/server/operations/desktop-server-replacement";
import {
  assertPreparedServerMatchesRequest,
  executeDesktopServerReplacement,
} from "@/platform/server/operations/desktop-server-replacement-core";
import { executeDesktopServerSwitch } from "@/platform/server/operations/desktop-server-switch";
import { cancelDesktopBrowserSignIn } from "@/platform/auth/browser-authorization";

type ReplacementContext = {
  prepared: PreparedDesktopServer;
  request: DesktopServerReplacementRequest;
};

type ReplacementState =
  | { phase: "idle" }
  | { phase: "verifying" }
  | ({
      phase: "confirm" | "discard" | "rechecking" | "replacing";
    } & ReplacementContext)
  | { phase: "error"; message: string }
  | { phase: "fatal"; message: string };

export function DesktopServerReplacementController({
  openPath,
}: {
  openPath: (path: string) => void;
}) {
  const [state, setState] = React.useState<ReplacementState>({ phase: "idle" });
  const stateRef = React.useRef(state);
  const verificationOperation = React.useRef(0);
  stateRef.current = state;

  const cancelCandidate = React.useCallback(
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          verificationOperation.current += 1;
          const current = stateRef.current;
          if ("prepared" in current) {
            yield* discardCandidate(current.prepared.candidateId).pipe(Effect.ignore);
          }
          setState({ phase: "idle" });
        }),
      ),
    [],
  );

  React.useEffect(
    () =>
      subscribeDesktopServerReplacement((request) => {
        const previous = stateRef.current;
        if (isReplacementBusy(previous)) return;
        const operation = ++verificationOperation.current;
        if ("prepared" in previous) {
          void Effect.runPromise(discardCandidate(previous.prepared.candidateId));
        }
        setState({ phase: "verifying" });
        recordDesktopDiagnostic("server_replacement.verification", {
          status: "started",
        });
        const verificationFailed = (error: unknown) =>
          Effect.sync(() => {
            if (operation !== verificationOperation.current) return;
            recordDesktopDiagnostic(
              "server_replacement.verification",
              describeDesktopError(error),
              "error",
            );
            setState({ phase: "error", message: getApiErrorMessage(error) });
          });
        void Effect.runPromise(
          Effect.gen(function* () {
            const prepared = yield* Effect.tryPromise({
              try: () => prepareDesktopServerCandidate(request.serverUrl),
              catch: (error) => error,
            }).pipe(Effect.catch(verificationFailed));
            if (!prepared) return;
            if (operation !== verificationOperation.current) {
              yield* discardCandidate(prepared.candidateId).pipe(Effect.ignore);
              return;
            }
            yield* Effect.try({
              try: () => assertPreparedServerMatchesRequest(prepared, request),
              catch: (error) => error,
            }).pipe(
              Effect.tapError(() => discardCandidate(prepared.candidateId).pipe(Effect.ignore)),
            );
            const current = getSelectedDesktopServer();
            if (current && desktopServersReferToSameInstance(current, prepared.server)) {
              yield* discardCandidate(prepared.candidateId);
              setState({ phase: "idle" });
              if (request.path) openPath(request.path);
              return;
            }

            recordDesktopDiagnostic("server_replacement.verification", {
              status: "success",
            });
            setState({ phase: "replacing", prepared, request });
            yield* Effect.tryPromise({
              try: () =>
                executeDesktopServerSwitch({
                  candidateId: prepared.candidateId,
                  path: request.path ?? "/login",
                  server: prepared.server,
                }),
              catch: (error) => error,
            });
          }).pipe(Effect.catchCause((cause) => verificationFailed(Cause.squash(cause)))),
        );
      }),
    [openPath],
  );

  const replaceServer = React.useCallback(
    (context: ReplacementContext) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const current = getSelectedDesktopServer();
          if (!current) {
            setState({
              phase: "error",
              message: "The current desktop server is unavailable.",
            });
            return;
          }

          setState({ ...context, phase: "rechecking" });
          const refreshed = yield* Effect.gen(function* () {
            const candidate = yield* Effect.tryPromise({
              try: () => prepareDesktopServerCandidate(context.request.serverUrl),
              catch: (error) => error,
            });
            yield* Effect.try({
              try: () => {
                assertPreparedServerMatchesRequest(candidate, context.request);
                if (!desktopServersReferToSameInstance(context.prepared.server, candidate.server)) {
                  throw new Error(
                    "The server identity changed during confirmation. Review the server and try again.",
                  );
                }
              },
              catch: (error) => error,
            }).pipe(
              Effect.tapError(() => discardCandidate(candidate.candidateId).pipe(Effect.ignore)),
            );
            yield* discardCandidate(context.prepared.candidateId).pipe(Effect.ignore);
            return candidate;
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.sync(() => {
                const error = Cause.squash(cause);
                recordDesktopDiagnostic(
                  "server_replacement.reverification",
                  describeDesktopError(error),
                  "error",
                );
                setState({ phase: "error", message: getApiErrorMessage(error) });
              }),
            ),
          );
          if (!refreshed) return;

          const refreshedContext = { ...context, prepared: refreshed };
          setState({ ...refreshedContext, phase: "replacing" });
          recordDesktopDiagnostic("server_replacement.commit", { status: "started" });
          yield* Effect.gen(function* () {
            yield* Effect.tryPromise({
              try: () =>
                executeDesktopServerReplacement(
                  refreshed,
                  current,
                  context.request.path,
                  createDesktopServerReplacementDependencies({
                    beforeLocalCleanup: () =>
                      Effect.runPromise(
                        Effect.gen(function* () {
                          yield* Effect.tryPromise({
                            try: () => cancelDesktopBrowserSignIn(),
                            catch: (error) => error,
                          }).pipe(Effect.ignore);
                          openPath("/login");
                          yield* Effect.promise(afterReactTeardown);
                        }),
                      ),
                    reload: (path) => window.location.assign(path),
                  }),
                ),
              catch: (error) => error,
            });
            recordDesktopDiagnostic("server_replacement.commit", { status: "success" });
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.sync(() => {
                const error = Cause.squash(cause);
                recordDesktopDiagnostic(
                  "server_replacement.commit",
                  describeDesktopError(error),
                  "error",
                );
                setState({
                  phase: "fatal",
                  message: `${getApiErrorMessage(error)} Restart Zilobase before trying again.`,
                });
              }),
            ),
          );
        }),
      ),
    [openPath],
  );

  const context = "prepared" in state ? state : null;
  const busy =
    state.phase === "verifying" || state.phase === "rechecking" || state.phase === "replacing";

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && !busy) void cancelCandidate();
      }}
      open={state.phase !== "idle"}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{replacementTitle(state)}</AlertDialogTitle>
          <AlertDialogDescription>{replacementDescription(state)}</AlertDialogDescription>
        </AlertDialogHeader>

        {busy ? (
          <div className="flex items-center gap-2 text-sm text-content-secondary">
            <Spinner />
            {state.phase === "verifying"
              ? "Checking discovery metadata, TLS, and compatibility..."
              : state.phase === "rechecking"
                ? "Rechecking the server before removing local data..."
                : "Switching servers..."}
          </div>
        ) : null}

        <AlertDialogFooter>
          {state.phase === "error" ? (
            <AlertDialogAction onClick={() => setState({ phase: "idle" })}>Close</AlertDialogAction>
          ) : state.phase === "fatal" ? (
            <AlertDialogAction
              onClick={() => Effect.runSync(Effect.sync(() => window.location.reload()))}
            >
              Restart Zilobase
            </AlertDialogAction>
          ) : !busy ? (
            <AlertDialogCancel onClick={() => void cancelCandidate()}>Cancel</AlertDialogCancel>
          ) : null}
          {state.phase === "confirm" && context ? (
            <AlertDialogAction onClick={() => void replaceServer(context)} variant="destructive">
              Change server
            </AlertDialogAction>
          ) : null}
          {state.phase === "discard" && context ? (
            <AlertDialogAction onClick={() => void replaceServer(context)} variant="destructive">
              Permanently discard and change
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function replacementTitle(state: ReplacementState) {
  switch (state.phase) {
    case "verifying":
      return "Verify Zilobase server";
    case "confirm":
      return `Change to ${state.prepared.server.displayName}?`;
    case "discard":
      return "Discard local data and change server?";
    case "replacing":
      return "Changing server";
    case "rechecking":
      return "Reverify before changing";
    case "error":
      return "Server could not be verified";
    case "fatal":
      return "Server change did not finish";
    case "idle":
      return "";
  }
}

function replacementDescription(state: ReplacementState) {
  switch (state.phase) {
    case "verifying":
      return "Your existing connection will not be changed during verification.";
    case "confirm":
      return "This signs out of the current server and permanently removes its credentials, cached data, tabs, and local session state from this device.";
    case "discard":
      return "Changing servers permanently removes local data for the current server.";
    case "replacing":
      return "Keep Zilobase open while local data and credentials for the previous server are removed.";
    case "rechecking":
      return "The current connection remains untouched until this final compatibility check succeeds.";
    case "error":
    case "fatal":
      return state.message;
    case "idle":
      return "";
  }
}

function afterReactTeardown() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

function isReplacementBusy(state: ReplacementState) {
  return state.phase === "rechecking" || state.phase === "replacing";
}

function discardCandidate(candidateId: string) {
  return Effect.tryPromise({
    try: () => discardDesktopServerCandidate(candidateId),
    catch: (error) => error,
  });
}
