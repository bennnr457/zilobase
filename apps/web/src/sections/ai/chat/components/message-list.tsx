"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { MessageScrollerContent } from "@/components/ui/message-scroller";

// The surrounding chat owns the sole viewport in every presentation.
export const MessageList = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("relative flex-1", className)} {...props} />
);

export const MessageListContent = ({
  className,
  ...props
}: ComponentProps<typeof MessageScrollerContent>) => (
  <MessageScrollerContent
    className={cn("flex h-auto min-h-0 flex-col gap-8 p-4", className)}
    {...props}
  />
);
