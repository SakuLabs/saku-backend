import { LlmToolCall } from '../infrastructure/llm/llm.client';

export type ConversationRole = 'user' | 'assistant' | 'tool';

export interface ConversationMessage {
  role: ConversationRole;
  content: string | null;
  toolCalls?: LlmToolCall[];
  toolCallId?: string;
}

export interface ConversationSummary {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationRepository {
  create(userId: string, title?: string): Promise<ConversationSummary>;
  findById(id: string): Promise<ConversationSummary | null>;
  listByUser(userId: string): Promise<ConversationSummary[]>;
  getMessages(conversationId: string): Promise<ConversationMessage[]>;
  appendMessages(
    conversationId: string,
    messages: ConversationMessage[],
  ): Promise<void>;
}
