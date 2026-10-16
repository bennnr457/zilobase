"use client";

import type { ChangeEvent, RefObject } from "react";

import { ChatbotScrollButton } from "../../chat/components/chatbot-scroll-control";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "./prompt-input";

type ChatbotComposerProps = {
  isSidebar: boolean;
  onSubmit: (message: PromptInputMessage) => void | Promise<void>;
  onTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  rootRef: RefObject<HTMLDivElement | null>;
  text: string;
};

export const ChatbotComposer = ({
  isSidebar: _isSidebar,
  onSubmit,
  onTextChange,
  rootRef,
  text,
}: ChatbotComposerProps) => (
  <div className="relative z-10 -mx-4 grid shrink-0 gap-3 bg-surface-canvas px-4 pt-3 pb-4 md:mx-0 md:px-0 md:pb-6">
    <ChatbotScrollButton targetRef={rootRef} />
    <div className="mx-auto w-full max-w-full">
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea
          onChange={onTextChange}
          placeholder="Ask anything about this workspace"
          value={text}
        />
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit disabled={!text.trim()} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  </div>
);
