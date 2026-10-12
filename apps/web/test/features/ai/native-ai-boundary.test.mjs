export function register({ readSource, assert, test }) {
  test("Ask AI UI does not import the removed chat client", async () => {
    const chatbotSource = await readSource(
      "/src/features/ai/conversations/components/elements/chatbot.tsx",
    );
    const conversationSource = await readSource(
      "/src/features/ai/conversations/use-chatbot-conversation.ts",
    );
    assert.doesNotMatch(chatbotSource, /@zilobase\/features\/ai-chat/);
    assert.doesNotMatch(conversationSource, /@zilobase\/features\/ai-chat/);
  });
}
