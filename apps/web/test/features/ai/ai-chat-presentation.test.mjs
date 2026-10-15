import { readChatbotSource } from "./ai-chatbot-source.mjs";

export function register({ readSource, assert, test }) {
  test("Ask AI supports persistent docked and floating desktop modes", async () => {
    const layoutSource = await readSource("/src/app/shell/app-shell.tsx");
    const sidebarSource = await readSource("/src/components/ai/chat-sidebar.tsx");

    assert.match(
      layoutSource,
      /CHAT_PRESENTATION_MODE_STORAGE_KEY\s*=\s*"zilobase:ai-chat-presentation-mode"/,
    );
    assert.match(
      layoutSource,
      /chatSidebarOpen\s*&&\s*!isMobile\s*&&\s*chatPresentationMode\s*===\s*"floating"/,
    );
    assert.match(layoutSource, /aria-label="Floating Ask AI chat"/);
    assert.match(layoutSource, /<FloatingWidget aria-label="Floating Ask AI chat">/);
    assert.match(layoutSource, /chatPanel=\{askAiEnabled && dockedChatOpen \? chatPanel : null\}/);
    assert.match(sidebarSource, /export type ChatPresentationMode = "floating" \| "sidebar"/);
    assert.match(sidebarSource, /onPresentationModeChange/);
  });

  test("full-page Ask AI uses the page viewport and hides the duplicate launcher", async () => {
    const aiPageSource = await readSource("/src/components/ai/ai.tsx");
    const workspaceSource = await readSource("/src/components/ai/ask-ai-workspace.tsx");
    const chatbotSource = await readChatbotSource(readSource);
    const layoutSource = await readSource("/src/app/shell/app-shell.tsx");

    assert.match(
      layoutSource,
      /!askAiEnabled \|\| chatSidebarOpen \|\| isAiPage \|\| isFullPanePage \? null/,
    );
    assert.match(chatbotSource, /\[data-ai-scroll-shell\], \[data-page-scroll-viewport\]/);
    assert.match(aiPageSource, /<AskAiWorkspace/);
    assert.match(workspaceSource, /mainScrollClassName="overscroll-y-none"/);
    assert.doesNotMatch(workspaceSource, /standalone/);
  });

  test("Ask AI keeps the composer outside its scrolling history", async () => {
    const personal = await readSource("/src/components/ai/elements/chatbot.tsx");
    assert.match(personal, /data-ai-scroll-shell[\s\S]*?overflow-y-auto/);
    assert.match(
      personal,
      /<\/ChatLayout>\s*<\/div>\s*<ChatLayout[^>]*>\s*\{beforeComposer\}\s*<ChatbotComposer/,
    );
  });
}
