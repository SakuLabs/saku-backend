import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  ConversationMessage,
  ConversationRole,
  ConversationSummary,
  IConversationRepository,
} from '../../domain/conversation.repository.interface';
import { LlmToolCall } from '../llm/llm.client';

interface ConversationRow {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageRow {
  role: string;
  content: string | null;
  toolCalls: unknown;
  toolCallId: string | null;
}

@Injectable()
export class PrismaConversationRepository implements IConversationRepository {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, title?: string): Promise<ConversationSummary> {
    const row = await this.prisma.agentConversation.create({
      data: { userId, title },
    });
    return this.toSummary(row as ConversationRow);
  }

  async findById(id: string): Promise<ConversationSummary | null> {
    const row = await this.prisma.agentConversation.findUnique({
      where: { id },
    });
    return row ? this.toSummary(row as ConversationRow) : null;
  }

  async listByUser(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.prisma.agentConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.toSummary(r as ConversationRow));
  }

  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    const rows = await this.prisma.agentMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toMessage(r as MessageRow));
  }

  async appendMessages(
    conversationId: string,
    messages: ConversationMessage[],
  ): Promise<void> {
    if (messages.length === 0) return;
    await this.prisma.agentMessage.createMany({
      data: messages.map((m) => ({
        conversationId,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls as never,
        toolCallId: m.toolCallId,
      })),
    });
    // Touch the parent so @updatedAt advances (empty data still triggers it).
    await this.prisma.agentConversation.update({
      where: { id: conversationId },
      data: {},
    });
  }

  private toSummary(row: ConversationRow): ConversationSummary {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toMessage(row: MessageRow): ConversationMessage {
    return {
      role: row.role as ConversationRole,
      content: row.content,
      toolCalls: (row.toolCalls as LlmToolCall[] | null) ?? undefined,
      toolCallId: row.toolCallId ?? undefined,
    };
  }
}
