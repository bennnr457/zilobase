const chatbotFiles = [
  "/src/components/ai/elements/chatbot.tsx",
  "/src/components/ai/elements/chatbot-composer.tsx",
  "/src/components/ai/elements/chatbot-messages.tsx",
  "/src/components/ai/elements/chatbot-scroll-control.tsx",
];

export async function readChatbotSource(readSource) {
  return (await Promise.all(chatbotFiles.map((file) => readSource(file)))).join("\n");
}
