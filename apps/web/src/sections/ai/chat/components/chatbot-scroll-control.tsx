"use client";

import { MessageScrollerButton } from "@/components/ui/message-scroller";

export const ChatbotScrollButton = () => (
  <MessageScrollerButton
    aria-label="Scroll to bottom"
    className="top-3 bottom-auto! left-1/2 z-20 size-8 -translate-x-1/2 -translate-y-full! rounded-full bg-surface-canvas shadow-sm"
    size="icon"
    variant="outline"
  />
);
