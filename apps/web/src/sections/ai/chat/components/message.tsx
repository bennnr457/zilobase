"use client";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message as MessageRoot, MessageContent as MessageBody } from "@/components/ui/message";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";
import { createContext, lazy, memo, Suspense, useContext } from "react";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant" | "system";
};

const MessageRoleContext = createContext<MessageProps["from"]>("assistant");

export const Message = ({ className, from, ...props }: MessageProps) => (
  <MessageRoleContext.Provider value={from}>
    <MessageRoot
      align={from === "user" ? "end" : "start"}
      className={cn(
        "group flex w-full max-w-[95%] flex-col gap-2 text-sm",
        from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
        className,
      )}
      {...props}
    />
  </MessageRoleContext.Provider>
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({ children, className, ...props }: MessageContentProps) => {
  const from = useContext(MessageRoleContext);
  return (
    <MessageBody
      className={cn(
        "flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm text-content-primary",
        from === "user" ? "ml-auto" : "w-full",
        className,
      )}
      {...props}
    >
      {from === "user" ? (
        <Bubble align="end" variant="secondary" className="max-w-full">
          <BubbleContent className="flex flex-col gap-2 border-0 px-4 py-3 text-sm text-content-primary!">
            {children}
          </BubbleContent>
        </Bubble>
      ) : (
        children
      )}
    </MessageBody>
  );
};

type MessageResponseProps = {
  children?: string;
  className?: string;
  isAnimating?: boolean;
};

const LazyMessageMarkdown = lazy(() => import("./message-markdown"));

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Suspense
      fallback={<div className={cn("whitespace-pre-wrap", className)}>{props.children}</div>}
    >
      <LazyMessageMarkdown className={className} {...props} />
    </Suspense>
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating &&
    prevProps.className === nextProps.className,
);

MessageResponse.displayName = "MessageResponse";
