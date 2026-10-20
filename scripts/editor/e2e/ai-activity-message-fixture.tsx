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
        <Button onClick={() => setStreaming(false)}>Finish answer</Button>
      </div>
      <div className="h-[500px]">
        <MessageScrollerProvider>
          <MessageScroller>
            <MessageScrollerViewport>
              <ChatbotMessages
                isSidebar
                messages={[
                  { id: "user", role: "user", text: "Read the selected page" },
                  { id: "assistant", role: "assistant", text },
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
