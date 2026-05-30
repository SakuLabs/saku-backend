import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LlmClient, LlmMessage } from '../infrastructure/llm/llm.client';
import {
  ConversationMessage,
  IConversationRepository,
} from '../domain/conversation.repository.interface';
import { ToolRegistry } from './tools/tool-registry';
import { SystemPromptService } from '../infrastructure/prompt/system-prompt.service';

const MAX_ITERATIONS = 5;

export interface AgentChatResult {
  conversationId: string;
  reply: string;
  actions: { tool: string; ok: boolean }[];
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly llm: LlmClient,
    private readonly toolRegistry: ToolRegistry,
    @Inject('IConversationRepository')
    private readonly conversationRepo: IConversationRepository,
    private readonly systemPromptService: SystemPromptService,
  ) {}

  async chat(
    userId: string,
    content: string,
    conversationId?: string,
  ): Promise<AgentChatResult> {
    // Feature gate: refuse before any DB write or LLM call so no tokens are
    // spent until the agent is explicitly enabled via AGENT_ENABLED=true.
    if (process.env.AGENT_ENABLED !== 'true') {
      throw new ServiceUnavailableException('Asisten AI sedang dinonaktifkan');
    }

    const conversation = conversationId
      ? await this.requireOwnedConversation(conversationId, userId)
      : await this.conversationRepo.create(userId);

    const history = await this.conversationRepo.getMessages(conversation.id);

    const llmMessages: LlmMessage[] = [
      {
        role: 'system',
        content: this.systemPromptService.render({
          now: new Date().toISOString(),
        }),
      },
      ...history.map((m) => this.toLlmMessage(m)),
      { role: 'user', content },
    ];

    // Buffer of new messages to persist at the end of the turn.
    const toPersist: ConversationMessage[] = [{ role: 'user', content }];
    const actions: { tool: string; ok: boolean }[] = [];

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const response = await this.llm.chat(
          llmMessages,
          this.toolRegistry.definitions(),
        );

        const assistantMsg: ConversationMessage = {
          role: 'assistant',
          content: response.content,
          toolCalls: response.tool_calls,
        };
        llmMessages.push(this.toLlmMessage(assistantMsg));
        toPersist.push(assistantMsg);

        if (!response.tool_calls || response.tool_calls.length === 0) {
          await this.conversationRepo.appendMessages(
            conversation.id,
            toPersist,
          );
          return {
            conversationId: conversation.id,
            reply: response.content ?? '',
            actions,
          };
        }

        for (const call of response.tool_calls) {
          let resultContent: string;
          let ok = true;
          try {
            const result = await this.toolRegistry.dispatch(
              call.function.name,
              call.function.arguments,
              { userId },
            );
            resultContent = JSON.stringify(result);
          } catch (err) {
            ok = false;
            resultContent = JSON.stringify({
              error:
                err instanceof Error ? err.message : 'Tool gagal dijalankan',
            });
            this.logger.warn(
              `Tool ${call.function.name} failed: ${resultContent}`,
            );
          }
          actions.push({ tool: call.function.name, ok });

          const toolMsg: ConversationMessage = {
            role: 'tool',
            content: resultContent,
            toolCallId: call.id,
          };
          llmMessages.push(this.toLlmMessage(toolMsg));
          toPersist.push(toolMsg);
        }
      }

      // Iteration cap reached without a settled text reply.
      const fallback =
        'Maaf, saya tidak dapat menyelesaikan permintaan itu sekarang.';
      toPersist.push({ role: 'assistant', content: fallback });
      await this.conversationRepo.appendMessages(conversation.id, toPersist);
      return { conversationId: conversation.id, reply: fallback, actions };
    } catch (err) {
      // Persist the partial turn so executed side-effects keep a conversation trail.
      try {
        await this.conversationRepo.appendMessages(conversation.id, toPersist);
      } catch (persistErr) {
        this.logger.error(
          `Failed to persist partial turn for ${conversation.id}: ${String(persistErr)}`,
        );
      }
      throw err;
    }
  }

  async getConversationMessages(
    userId: string,
    conversationId: string,
  ): Promise<ConversationMessage[]> {
    await this.requireOwnedConversation(conversationId, userId);
    return this.conversationRepo.getMessages(conversationId);
  }

  private async requireOwnedConversation(id: string, userId: string) {
    const conversation = await this.conversationRepo.findById(id);
    if (!conversation || conversation.userId !== userId) {
      throw new ForbiddenException('Percakapan tidak ditemukan');
    }
    return conversation;
  }

  private toLlmMessage(m: ConversationMessage): LlmMessage {
    return {
      role: m.role,
      content: m.content,
      tool_calls: m.toolCalls,
      tool_call_id: m.toolCallId,
    };
  }
}
