import { chatCitations, chatDisplayText } from "@zilobase/features/ai";
import { getNavigationItemPath } from "@/app/routing/route-identifiers";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useOpenEmbeddedPage } from "@/sections/pages/navigation/hooks/page-navigation";
import { PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";
import {
  DEFAULT_DATABASE_ITEM_ICON,
  DEFAULT_PAGE_ITEM_ICON,
} from "@/components/navigation/lib/navigation-icons";

import { MessageScrollerItem } from "@/components/ui/message-scroller";
import { MessageList, MessageListContent } from "./message-list";
import { Message, MessageContent, MessageResponse } from "./message";

import type { ChatMessage } from "@zilobase/features/ai";
export type { ChatMessage } from "@zilobase/features/ai";

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
        {messages.map((message) => {
          const citations =
            message.role === "assistant" && message.context
              ? chatCitations(message.text, message.context.manifest).filter(
                  (entry) => entry.pageId || entry.databaseId,
                )
              : [];
          return (
            <MessageScrollerItem
              key={message.id}
              messageId={message.id}
              className="[content-visibility:visible]"
            >
              <Message from={message.role}>
                <MessageContent>
                  <MessageResponse>
                    {message.role === "assistant" ? chatDisplayText(message.text) : message.text}
                  </MessageResponse>
                  {citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2" aria-label="Answer sources">
                      {citations.map((entry) => (
                        <Button
                          key={entry.key}
                          asChild
                          size="sm"
                          variant="outline"
                          className="max-w-full justify-start"
                        >
                          <Link
                            title={entry.title}
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
                            <span aria-hidden="true" className="inline-flex shrink-0">
                              <PageIconDisplay
                                size="sm"
                                value={
                                  entry.emoji ??
                                  (entry.pageId
                                    ? DEFAULT_PAGE_ITEM_ICON
                                    : DEFAULT_DATABASE_ITEM_ICON)
                                }
                              />
                            </span>
                            <span className="truncate">{entry.title}</span>
                          </Link>
                        </Button>
                      ))}
                    </div>
                  )}
                </MessageContent>
              </Message>
            </MessageScrollerItem>
          );
        })}
      </MessageListContent>
    </MessageList>
  );
}
