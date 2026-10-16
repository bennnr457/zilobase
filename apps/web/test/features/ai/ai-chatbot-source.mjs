const chatbotFiles = [
  "/src/sections/ai/chat/components/chatbot.tsx",
  "/src/sections/ai/composer/components/chatbot-composer.tsx",
  "/src/sections/ai/chat/components/chatbot-messages.tsx",
  "/src/sections/ai/chat/components/chatbot-scroll-control.tsx",
];

export async function readChatbotSource(readSource) {
  return (await Promise.all(chatbotFiles.map((file) => readSource(file)))).join("\n");
}
