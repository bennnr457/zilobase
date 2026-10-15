import { existsSync } from "node:fs";
import { readChatbotSource } from "./ai-chatbot-source.mjs";

export function register({ readSource, assert, test }) {
  test("Ask AI has UI state without a conversation runtime or client SDK", async () => {
    const sources = await Promise.all([
      readChatbotSource(readSource),
      readSource("/src/components/ai/workspace/ask-ai-workspace.tsx"),
      readSource("/src/app/shell/sidebar/app-sidebar.tsx"),
      readSource("/src/components/ai/composer/prompt-input.tsx"),
      readSource("/src/components/ai/chat/message.tsx"),
    ]);
    assert.doesNotMatch(
      sources.join("\n"),
      /@zilobase\/features\/ai-chat|useAiChatThreadState|useChatbotConversation|apiFetch|authFetch|useMutation|from ["'](?:ai|@ai-sdk\/[^"']+|agents)["']/,
    );
    const editorSources = await Promise.all([
      readSource("/src/components/editor/composition/editor.tsx"),
      readSource("/src/components/editor/runtime/page-editor-registry.tsx"),
    ]);
    assert.doesNotMatch(
      editorSources.join("\n"),
      /SelectionAiPreview|PageEditPreview|showEditDiffPreview|toolCallId/,
    );
    assert.equal(
      existsSync(new URL("../../../src/components/ai/conversations", import.meta.url)),
      false,
    );
  });
}
