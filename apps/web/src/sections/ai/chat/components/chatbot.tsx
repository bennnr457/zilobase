import { ChatLayout } from "./chat-layout";
import { Button } from "@/components/ui/button";
import { ChatbotComposer } from "../../composer/components/chatbot-composer";
import { ChatbotMessages, type ChatMessage } from "./chatbot-messages";
import { useSession } from "@zilobase/features/auth/react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import type { PromptInputMessage } from "../../composer/components/prompt-input";

export default function Chatbot({
  isSidebar = false,
  beforeComposer,
}: {
  isSidebar?: boolean;
  beforeComposer?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const onSubmit = useCallback((message: PromptInputMessage) => {
    const nextText = message.text.trim();
    if (!nextText) return;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: nextText },
    ]);
    setText("");
  }, []);
  const hasMessages = messages.length > 0;
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={rootRef} data-ai-scroll-shell className="min-h-0 flex-1 overflow-y-auto">
        <ChatLayout sidebar={isSidebar}>
          {!hasMessages && (
            <div className="mx-auto mb-6 grid w-full max-w-3xl justify-items-center gap-3 px-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-secondary text-lg font-semibold">
                AI
              </div>
              <div>
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {getGreeting(session?.user?.name)}
                </h1>
                <p className="mt-1 text-sm text-content-secondary">
                  Search, create, and work across your Zilobase workspace.
                </p>
              </div>
              <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                {starterPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    onClick={() => setText(prompt)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <ChatbotMessages isSidebar={isSidebar} messages={messages} />
        </ChatLayout>
      </div>
      <ChatLayout sidebar={isSidebar}>
        {beforeComposer}
        <ChatbotComposer
          isSidebar={isSidebar}
          onSubmit={onSubmit}
          onTextChange={(event) => setText(event.target.value)}
          rootRef={rootRef}
          text={text}
        />
      </ChatLayout>
    </div>
  );
}

function getGreeting(name?: string | null) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `${greeting}, ${firstName}` : greeting;
}

const starterPrompts = [
  "Summarize my workspace",
  "Find relevant information",
  "Create a project plan",
];
