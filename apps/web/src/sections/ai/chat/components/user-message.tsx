import { useMemo } from "react";
import type { Components } from "streamdown";
import { chatMentionParts, type ChatMessage } from "@zilobase/features/ai";
import type { ResourceRef } from "@zilobase/page-context";
import { MessageResponse } from "./message";
import { SourcePill } from "./answer-sources";

export function UserMessage({ message }: { message: ChatMessage }) {
  const { markdown, components } = useMemo(() => {
    const sources = new Map<string, ResourceRef>();
    const markdown = chatMentionParts(message.text, message.roots)
      .map((part, index) => {
        if (part.type === "text") return part.text;
        const href = `#ask-ai-mention-${index}`;
        sources.set(href, part.source);
        return `[${part.source.type}](${href})`;
      })
      .join("");
    const components: Components = {
      a: ({ href, children, ...props }) => {
        const source = sources.get(href ?? "");
        return source ? (
          <InlineMention source={source} />
        ) : (
          <a {...props} href={href}>
            {children}
          </a>
        );
      },
    };
    return { markdown, components };
  }, [message.text, message.roots]);
  return <MessageResponse components={components}>{markdown}</MessageResponse>;
}

function InlineMention({ source }: { source: ResourceRef }) {
  return (
    <span
      data-ai-message-mention={`${source.type}:${source.id}`}
      className="mx-0.5 inline-flex max-w-full align-middle"
    >
      <SourcePill
        entry={{
          key: `${source.type}:${source.id}`,
          title: source.type === "page" ? "Page" : "Database",
          ...(source.type === "page" ? { pageId: source.id } : { databaseId: source.id }),
        }}
      />
    </span>
  );
}
