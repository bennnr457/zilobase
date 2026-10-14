import { Effect } from "effect";
import { NetworkUnavailableError } from "@/platform/network/api";
import { installRequestPolicy, type RequestObservation } from "@/platform/network/request-policy";
import { applyDemoReadOverlay, interceptDemoRequest } from "@/app/demo/transport";
import { installDesktopServerSwitch } from "@/platform/server/operations/desktop-server-switch";
import { switchDesktopServerSession } from "./desktop-session";
import { isDesktopApp } from "@/platform/desktop/native";
import { createNativeMeetingCaptureRuntime } from "@/platform/desktop/meetings/native-capture-runtime";
import { BrowserMeetingCapture } from "@/components/meetings/capture/browser-meeting-capture";
import { createBrowserMeetingCaptureRuntime } from "@/components/meetings/capture/browser-capture-runtime";
import { installMeetingCaptureRuntime } from "@/components/meetings/capture/capture-runtime";

export function configureApplicationSessions() {
  Effect.runSync(Effect.sync(() => installDesktopServerSwitch(switchDesktopServerSession)));
}

/** Install before startup work or rendering can issue feature requests. */
export function configureApplicationRequests() {
  Effect.runSync(
    Effect.sync(() =>
      installRequestPolicy({
        intercept(path, method, body) {
          const demo = interceptDemoRequest(path, method, body);
          if (demo.handled) return demo;
          return { handled: false };
        },
        observe: observeDesktopConnectivity,
        transformResponse: applyDemoReadOverlay,
      }),
    ),
  );
}

function observeDesktopConnectivity(event: RequestObservation) {
  Effect.runSync(
    Effect.gen(function* () {
      if (event.type === "network-error") {
        return yield* Effect.fail(
          new NetworkUnavailableError(
            event.error instanceof Error ? event.error.message : undefined,
          ),
        );
      }
      // Any HTTP response proves reachability, including authorization and 5xx errors.
      if (event.status === 401) {
        yield* Effect.sync(() =>
          window.dispatchEvent(new Event("zilobase:authentication-required")),
        );
      }
    }),
  );
}

export function configureApplicationMeetingCapture() {
  Effect.runSync(
    Effect.sync(() =>
      installMeetingCaptureRuntime(
        isDesktopApp()
          ? createNativeMeetingCaptureRuntime()
          : createBrowserMeetingCaptureRuntime(new BrowserMeetingCapture()),
      ),
    ),
  );
}
