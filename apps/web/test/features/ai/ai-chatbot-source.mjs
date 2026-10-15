const chatbotFiles = [
  "/src/components/ai/chat/chatbot.tsx",
  "/src/components/ai/composer/chatbot-composer.tsx",
  "/src/components/ai/chat/chatbot-messages.tsx",
  "/src/components/ai/chat/chatbot-scroll-control.tsx",
];

export async function readChatbotSource(readSource) {
  return (await Promise.all(chatbotFiles.map((file) => readSource(file)))).join("\n");
}
