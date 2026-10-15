import "../styles/ask-ai.css";
import type { ReactNode } from "react";
import { defaultUserSettings } from "@zilobase/features/user-settings";
import { useUserSettings } from "@zilobase/features/user-settings/react";
export function ChatLayout({
  children,
  sidebar = false,
}: {
  children: ReactNode;
  sidebar?: boolean;
}) {
  const { data: settings = defaultUserSettings } = useUserSettings();
  return (
    <div
      data-chat-layout={sidebar ? "sidebar" : settings.pageFullWidth ? "full" : "page"}
      className={
        sidebar
          ? "w-full shrink-0"
          : `mx-auto flex w-full shrink-0 flex-col ask-ai-content ${settings.pageFullWidth ? "" : "max-w-[900px]"}`
      }
    >
      {children}
    </div>
  );
}
