"use client";

import { useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import { useAppSearchResults } from "@zilobase/features/search/react";
import type { AppSearchResult } from "@zilobase/features/search";
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
  rootRef: RefObject<HTMLDivElement | null>;
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
  rootRef,
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
  const [selected, setSelected] = useState(0);
  const mention = dismissed ? null : mentionAtCaret(text, caret);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(mention?.query ?? ""), 180);
    return () => clearTimeout(timer);
  }, [mention?.query]);
  const search = useAppSearchResults(workspaceId, query, !!mention, ["page", "database"]);
  const results = query === mention?.query ? (search.data ?? []).slice(0, 8) : [];
  const choose = (item: AppSearchResult) => {
    if (!mention) return;
    onAttach(item);
    const next = text.slice(0, mention.start) + text.slice(mention.end);
    onTextChange(next);
    setCaret(mention.start);
    setDismissed(true);
    setSelected(0);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(mention.start, mention.start);
    });
  };
  return (
    <div className="relative z-10 -mx-4 grid shrink-0 gap-3 bg-surface-canvas px-4 pt-3 pb-4 md:mx-0 md:px-0 md:pb-6">
      <ChatbotScrollButton targetRef={rootRef} />
      <div className="mx-auto w-full max-w-full">
        <div className="max-h-[min(40vh,20rem)] overflow-y-auto overscroll-contain">{children}</div>
        <PromptInput onSubmit={onSubmit}>
          {mention && !disabled && (
            <div
              id="ai-mention-results"
              role="listbox"
              aria-label="Pages and databases"
              className="max-h-64 overflow-auto rounded-t-lg border-b p-1"
            >
              {search.isError ? (
                <p role="alert" className="p-2 text-sm">
                  Search failed. Try again.
                </p>
              ) : results.length ? (
                results.map((item, index) => (
                  <button
                    key={`${item.type}:${item.id}`}
                    id={`ai-mention-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === selected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(item)}
                    className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${index === selected ? "bg-surface-secondary" : ""}`}
                  >
                    <span>{item.emoji || (item.type === "database" ? "▦" : "▤")}</span>
                    <span className="truncate">{item.title}</span>
                    <span className="ml-auto text-xs text-content-secondary">{item.type}</span>
                  </button>
                ))
              ) : (
                <p className="p-2 text-sm text-content-secondary">
                  {search.isFetching || query !== mention.query
                    ? "Searching…"
                    : "No matching pages or databases"}
                </p>
              )}
            </div>
          )}
          <PromptInputTextarea
            ref={input}
            disabled={disabled}
            aria-label="Ask AI message"
            aria-controls={mention ? "ai-mention-results" : undefined}
            aria-expanded={!!mention}
            aria-autocomplete="list"
            aria-activedescendant={
              mention && results.length
                ? `ai-mention-${Math.min(selected, results.length - 1)}`
                : undefined
            }
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onChange={(event) => {
              onTextChange(event.target.value);
              setCaret(event.target.selectionStart);
              setDismissed(false);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (!mention || event.nativeEvent.isComposing) return;
              if (event.key === "Escape") {
                event.preventDefault();
                setDismissed(true);
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((value) =>
                  Math.max(
                    0,
                    Math.min(results.length - 1, value + (event.key === "ArrowDown" ? 1 : -1)),
                  ),
                );
              } else if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const item = results[Math.min(selected, results.length - 1)];
                if (item) choose(item);
              }
            }}
            placeholder="Ask about your workspace · @ to attach pages or databases"
            value={text}
          />
          <PromptInputFooter>
            <PromptInputTools />
            <span className="text-xs text-content-secondary">@ Add context</span>
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
    </div>
  );
};
