import { existsSync } from "node:fs";
import { readChatbotSource } from "./ai-chatbot-source.mjs";

export function register({ readSource, assert, test }) {
  test("Ask AI has UI state without a conversation runtime or client SDK", async () => {
    const sources = await Promise.all([
      readChatbotSource(readSource),
      readSource("/src/sections/ai/workspace/components/ask-ai-workspace.tsx"),
      readSource("/src/app/shell/sidebar/components/app-sidebar.tsx"),
      readSource("/src/sections/ai/composer/components/prompt-input.tsx"),
      readSource("/src/sections/ai/chat/components/message.tsx"),
    ]);
    assert.doesNotMatch(
      sources.join("\n"),
      /@zilobase\/features\/ai-chat|useAiChatThreadState|useChatbotConversation|apiFetch|authFetch|useMutation|from ["'](?:ai|@ai-sdk\/[^"']+|agents)["']/,
    );
    const editorSources = await Promise.all([
      readSource("/src/sections/pages/editor/editor.tsx"),
      readSource("/src/sections/pages/editor/runtime/components/page-editor-registry.tsx"),
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
