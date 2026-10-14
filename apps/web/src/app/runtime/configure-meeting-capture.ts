import { isDesktopApp } from "@/platform/desktop/native";
import { createNativeMeetingCaptureRuntime } from "@/platform/desktop/meetings";
import { BrowserMeetingCapture } from "@/components/meetings/capture";
import { createBrowserMeetingCaptureRuntime } from "@/components/meetings/capture/browser-capture-runtime";
import { installMeetingCaptureRuntime } from "@/components/meetings/capture/capture-runtime";

export function configureApplicationMeetingCapture() {
  installMeetingCaptureRuntime(
    isDesktopApp()
      ? createNativeMeetingCaptureRuntime()
      : createBrowserMeetingCaptureRuntime(new BrowserMeetingCapture()),
  );
}
