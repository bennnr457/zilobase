import { useState } from "react";
import { ChatbotMessages } from "@/sections/ai/chat/components/chatbot-messages";
import {
  MessageScroller,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { AgentActivity } from "@/sections/ai/chat/lib/agent-activity";
import { Button } from "@/components/ui/button";

export function AiActivityMessageFixture() {
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(true);
  const [stopped, setStopped] = useState(false);
  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          onClick={() =>
            setActivities([
              {
                id: "read",
                type: "task",
                title: "Reading selected pages",
                status: "running",
                steps: [{ id: "load", title: "Load page content", status: "running" }],
              },
            ])
          }
        >
          Emit activity
        </Button>
        <Button
          onClick={() =>
            setActivities((current) =>
              current.map((activity) =>
                activity.type === "task"
                  ? {
                      ...activity,
                      status: "completed",
                      steps: activity.steps.map((step) => ({ ...step, status: "completed" })),
                    }
                  : activity,
              ),
            )
          }
        >
          Complete activity
        </Button>
        <Button onClick={() => setText((current) => current + "Streamed answer. ")}>
          Stream answer
        </Button>
        <Button
          onClick={() =>
            setText((current) => current + "👩🏽‍💻 Cafe\u0301 日本語 smooth streaming. ".repeat(30))
          }
        >
          Stream burst
        </Button>
        <Button onClick={() => setText("Corrected server snapshot.")}>Replace answer</Button>
        <Button onClick={() => setText("")}>Reset answer</Button>
        <Button onClick={() => setStreaming(false)}>Finish answer</Button>
        <Button
          onClick={() => {
            setStopped(true);
            setStreaming(false);
          }}
        >
          Stop answer
        </Button>
      </div>
      <output aria-label="Received response" className="sr-only">
        {text}
      </output>
      <div className="h-[500px]">
        <MessageScrollerProvider>
          <MessageScroller>
            <MessageScrollerViewport>
              <ChatbotMessages
                isSidebar
                messages={[
                  { id: "user", role: "user", text: "Read the selected page" },
                  {
                    id: "assistant",
                    role: "assistant",
                    text,
                    status: streaming ? "streaming" : stopped ? "stopped" : "completed",
                  },
                ]}
                streaming={streaming}
                activityByMessage={{ assistant: activities }}
              />
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
    </div>
  );
}
