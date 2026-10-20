import "@/styles/global.css";
import "@/styles/app.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Message, MessageContent, MessageResponse } from "@/sections/ai/chat/components/message";
import { MessageScrollerProvider } from "@/components/ui/message-scroller";
import { AiPatternsFixture } from "./ai-patterns-fixture";
import { AiActivityMessageFixture } from "./ai-activity-message-fixture";

function Fixture() {
  const [markdown, setMarkdown] = useState("");
  return (
    <div className="mx-auto max-w-2xl p-4">
      <label>
        Response source
        <textarea
          aria-label="Response source"
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
        />
      </label>
      <MessageScrollerProvider>
        <div aria-label="Rendered response">
          <Message from="assistant">
            <MessageContent>
              <MessageResponse>{markdown}</MessageResponse>
            </MessageContent>
          </Message>
        </div>
      </MessageScrollerProvider>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("activity-message") ? (
    <StrictMode>
      <AiActivityMessageFixture />
    </StrictMode>
  ) : new URLSearchParams(location.search).has("patterns") ? (
    <AiPatternsFixture />
  ) : (
    <Fixture />
  ),
);
