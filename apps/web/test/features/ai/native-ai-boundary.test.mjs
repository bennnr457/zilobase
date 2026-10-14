import { existsSync } from "node:fs";
import { readChatbotSource } from "./ai-chatbot-source.mjs";

export function register({ readSource, assert, test }) {
  test("Ask AI has UI state without a conversation runtime or client SDK", async () => {
    const sources = await Promise.all([
      readChatbotSource(readSource),
      readSource("/src/features/ai/components/ask-ai-workspace.tsx"),
      readSource("/src/app/shell/navigation/components/ai-chats-section.tsx"),
      readSource("/src/features/ai/components/elements/prompt-input.tsx"),
      readSource("/src/features/ai/components/elements/message.tsx"),
    ]);
    assert.doesNotMatch(
      sources.join("\n"),
      /@zilobase\/features\/ai-chat|useAiChatThreadState|useChatbotConversation|apiFetch|authFetch|useMutation|from ["'](?:ai|@ai-sdk\/[^"']+|agents)["']/,
    );
    const editorSources = await Promise.all([
      readSource("/src/features/editor/composition/editor.tsx"),
      readSource("/src/features/editor/runtime/page-editor-registry.tsx"),
    ]);
    assert.doesNotMatch(
      editorSources.join("\n"),
      /SelectionAiPreview|PageEditPreview|showEditDiffPreview|toolCallId/,
    );
    assert.equal(
      existsSync(new URL("../../../src/features/ai/conversations", import.meta.url)),
      false,
    );
  });
}
