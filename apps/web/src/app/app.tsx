import { DesktopServerReplacementController } from "@/sections/desktop/servers/components/desktop-server-replacement-controller";
import { RouterProvider } from "@tanstack/react-router";

import { DesktopDeepLinkHandler } from "@/sections/desktop/deep-links/components/desktop-deep-link-handler";
import { DesktopServerSwitchOverlay } from "@/sections/desktop/servers/components/desktop-server-switch-overlay";
import {
  DesktopWindowTitlebar,
  isLinuxDesktopApp,
} from "@/sections/desktop/window/components/desktop-window-titlebar";
import { router } from "@/app/routing/router";

export default function App() {
  const app = (
    <>
      <DesktopServerReplacementController openPath={(path) => router.history.push(path)} />
      <DesktopDeepLinkHandler openPath={(path) => router.history.push(path)} />
      <DesktopServerSwitchOverlay />
      <RouterProvider router={router} />
    </>
  );

  if (!isLinuxDesktopApp()) return app;

  return (
    <div
      className="relative h-svh overflow-hidden bg-surface-canvas text-content-primary"
      data-desktop-linux-shell
    >
      <DesktopWindowTitlebar variant="fallback">
        <div className="min-w-0 flex-1 self-stretch" data-desktop-drag-region="" />
      </DesktopWindowTitlebar>
      <div
        className="h-full min-h-0 overflow-auto pt-9 [&>.h-svh]:h-full [&>.min-h-svh]:min-h-full"
        data-desktop-app-content
      >
        {app}
      </div>
    </div>
  );
}
