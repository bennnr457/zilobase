import { ChatbotConversationController } from "../chatbot-conversation";
import type { ChatbotProps } from "../../conversation-interface";

const Chatbot = (props: ChatbotProps) => <ChatbotConversationController {...props} />;

export default Chatbot;
