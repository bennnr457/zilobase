import { installDesktopServerSwitch } from "@/platform/server/operations/desktop-server-switch";
import { switchDesktopServerSession } from "./desktop-server-switch";

export function configureApplicationSessions() {
  installDesktopServerSwitch(switchDesktopServerSession);
}
