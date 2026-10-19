import { chatCitations } from "@zilobase/features/ai";
import { getNavigationItemPath } from "@/app/routing/route-identifiers";
import { Link } from "@tanstack/react-router";
import { useOpenEmbeddedPage } from "@/sections/pages/navigation/hooks/page-navigation";

import { MessageList, MessageListContent } from "./message-list";
import { Message, MessageContent, MessageResponse } from "./message";

import type { ChatMessage } from "@zilobase/features/ai";
export type { ChatMessage } from "@zilobase/features/ai";
import { ContextInspector } from "../../attachments/components/context-inspector";

export function ChatbotMessages({
  isSidebar,
  messages,
}: {
  isSidebar: boolean;
  messages: ChatMessage[];
}) {
  const { openPage } = useOpenEmbeddedPage({ contextPageId: null, page: null });
  return (
    <MessageList
      className={isSidebar ? undefined : "h-auto! overflow-visible! [scrollbar-gutter:auto]!"}
    >
      <MessageListContent>
        {messages.map((message) => (
          <Message from={message.role} key={message.id}>
            <MessageContent>
              <MessageResponse>{message.text}</MessageResponse>
              {message.context && (
                <div className="mt-2 flex flex-wrap gap-2" aria-label="Answer citations">
                  {chatCitations(message.text, message.context.manifest).map((entry) => (
                    <Link
                      key={entry.key}
                      className="rounded border px-2 py-1 text-xs underline"
                      to={getNavigationItemPath(
                        entry.pageId
                          ? { pageId: encodeURIComponent(entry.pageId) }
                          : { databaseId: encodeURIComponent(entry.databaseId!) },
                      )}
                      onClick={(event) => {
                        if (
                          !entry.pageId ||
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        )
                          return;
                        event.preventDefault();
                        openPage(entry.pageId, { databaseId: entry.databaseId });
                      }}
                    >
                      {entry.title}
                    </Link>
                  ))}
                </div>
              )}
              {message.status && message.status !== "completed" && (
                <p className="mt-2 text-xs text-content-secondary">{message.status}</p>
              )}
              {message.context && (
                <ContextInspector context={message.context} label="Sources for this answer" />
              )}
            </MessageContent>
          </Message>
        ))}
      </MessageListContent>
    </MessageList>
  );
}
