"use client";

import { useRef, useState, type ReactNode } from "react";
import type { AppSearchResult } from "@zilobase/features/search";
import { PageDatabaseSearchPopover } from "@/components/navigation/components/page-database-search-popover";
import { Button } from "@/components/ui/button";
import { ChatbotScrollButton } from "../../chat/components/chatbot-scroll-control";
import { mentionAtCaret } from "../lib/mentions";
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
  onTextChange: (text: string) => void;
  text: string;
  workspaceId: string | null;
  onAttach: (item: AppSearchResult) => void;
  disabled?: boolean;
  children?: ReactNode;
  onStop?: () => void;
};

export const ChatbotComposer = ({
  onSubmit,
  onTextChange,
  text,
  workspaceId,
  onAttach,
  disabled,
  children,
  onStop,
}: ChatbotComposerProps) => {
  const input = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const mention = dismissed ? null : mentionAtCaret(text, caret);
  const open = !!mention && !disabled;
  const choose = (item: AppSearchResult) => {
    if (!mention) return;
    onAttach(item);
    const next = text.slice(0, mention.start) + text.slice(mention.end);
    onTextChange(next);
    setCaret(mention.start);
    setDismissed(true);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(mention.start, mention.start);
    });
  };
  return (
    <div className="relative z-10 -mx-4 grid shrink-0 gap-3 bg-surface-canvas px-4 pt-3 pb-4 md:mx-0 md:px-0 md:pb-6">
      <ChatbotScrollButton />
      <div className="mx-auto w-full max-w-full">
        <div className="max-h-[min(40vh,20rem)] overflow-y-auto overscroll-contain">{children}</div>
        <PageDatabaseSearchPopover
          workspaceId={workspaceId}
          query={mention?.query ?? ""}
          inputRef={input}
          side="top"
          open={open}
          onOpenChange={(value) => {
            if (!value) setDismissed(true);
          }}
          onSelect={choose}
        >
          {(inputProps) => (
            <div>
              <PromptInput onSubmit={onSubmit}>
                <PromptInputTextarea
                  ref={input}
                  disabled={disabled}
                  aria-label="Ask AI message"
                  {...inputProps}
                  onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
                  onChange={(event) => {
                    onTextChange(event.target.value);
                    setCaret(event.target.selectionStart);
                    setDismissed(false);
                  }}
                  placeholder="Ask about your workspace · @ to attach pages or databases"
                  value={text}
                />
                <PromptInputFooter>
                  <PromptInputTools>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      aria-label="Add context"
                      aria-haspopup="listbox"
                      aria-expanded={open}
                      onClick={() => {
                        const start = input.current?.selectionStart ?? text.length;
                        const end = input.current?.selectionEnd ?? start;
                        const currentMention = mentionAtCaret(text, start);
                        const prefix = start > 0 && !/\s/.test(text[start - 1]!) ? " @" : "@";
                        const nextCaret = currentMention ? start : start + prefix.length;
                        if (!currentMention)
                          onTextChange(text.slice(0, start) + prefix + text.slice(end));
                        setCaret(nextCaret);
                        setDismissed(false);
                        requestAnimationFrame(() => {
                          input.current?.focus();
                          input.current?.setSelectionRange(nextCaret, nextCaret);
                        });
                      }}
                    >
                      @ Add context
                    </Button>
                  </PromptInputTools>
                  {onStop ? (
                    <Button type="button" variant="outline" size="sm" onClick={onStop}>
                      Stop
                    </Button>
                  ) : (
                    <PromptInputSubmit disabled={!text.trim() || disabled} />
                  )}
                </PromptInputFooter>
              </PromptInput>
            </div>
          )}
        </PageDatabaseSearchPopover>
      </div>
    </div>
  );
};
