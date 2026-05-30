import { AgentService } from './agent.service';
import { LlmClient, LlmResponseMessage } from '../infrastructure/llm/llm.client';
import { ToolRegistry } from './tools/tool-registry';
import {
  ConversationMessage,
  IConversationRepository,
} from '../domain/conversation.repository.interface';

describe('AgentService', () => {
  let service: AgentService;
  let llm: { chat: jest.Mock };
  let registry: { definitions: jest.Mock; dispatch: jest.Mock };
  let convRepo: jest.Mocked<IConversationRepository>;

  const summary = (id: string, userId: string) => ({
    id,
    userId,
    title: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    llm = { chat: jest.fn() };
    registry = { definitions: jest.fn().mockReturnValue([]), dispatch: jest.fn() };
    convRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      listByUser: jest.fn(),
      getMessages: jest.fn().mockResolvedValue([] as ConversationMessage[]),
      appendMessages: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IConversationRepository>;

    service = new AgentService(
      llm as unknown as LlmClient,
      registry as unknown as ToolRegistry,
      convRepo,
    );
  });

  it('creates a conversation when none is given and returns the text reply', async () => {
    convRepo.create.mockResolvedValue(summary('c1', 'user-1'));
    const reply: LlmResponseMessage = { role: 'assistant', content: 'Done!' };
    llm.chat.mockResolvedValue(reply);

    const result = await service.chat('user-1', 'hello');

    expect(convRepo.create).toHaveBeenCalledWith('user-1');
    expect(result.conversationId).toBe('c1');
    expect(result.reply).toBe('Done!');
    expect(result.actions).toEqual([]);
    expect(convRepo.appendMessages).toHaveBeenCalledTimes(1);
  });

  it('rejects a conversation owned by another user', async () => {
    convRepo.findById.mockResolvedValue(summary('c1', 'other-user'));
    await expect(service.chat('user-1', 'hi', 'c1')).rejects.toThrow();
  });

  it('executes a tool call then returns the follow-up text reply', async () => {
    convRepo.create.mockResolvedValue(summary('c1', 'user-1'));
    const toolTurn: LlmResponseMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'list_tasks', arguments: '{}' } },
      ],
    };
    const textTurn: LlmResponseMessage = { role: 'assistant', content: 'You have 2 tasks.' };
    llm.chat.mockResolvedValueOnce(toolTurn).mockResolvedValueOnce(textTurn);
    registry.dispatch.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);

    const result = await service.chat('user-1', 'how many tasks?');

    expect(registry.dispatch).toHaveBeenCalledWith('list_tasks', '{}', { userId: 'user-1' });
    expect(result.reply).toBe('You have 2 tasks.');
    expect(result.actions).toEqual([{ tool: 'list_tasks', ok: true }]);
  });

  it('feeds a tool error back to the model instead of throwing', async () => {
    convRepo.create.mockResolvedValue(summary('c1', 'user-1'));
    const toolTurn: LlmResponseMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'delete_schedule', arguments: '{"id":"x"}' } },
      ],
    };
    const textTurn: LlmResponseMessage = { role: 'assistant', content: 'That schedule is not yours.' };
    llm.chat.mockResolvedValueOnce(toolTurn).mockResolvedValueOnce(textTurn);
    registry.dispatch.mockRejectedValue(new Error('Tidak memiliki akses ke schedule ini'));

    const result = await service.chat('user-1', 'delete it');

    expect(result.reply).toBe('That schedule is not yours.');
    expect(result.actions).toEqual([{ tool: 'delete_schedule', ok: false }]);
  });

  it('stops after the iteration cap and returns a fallback message', async () => {
    convRepo.create.mockResolvedValue(summary('c1', 'user-1'));
    const toolTurn: LlmResponseMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'call_x', type: 'function', function: { name: 'list_tasks', arguments: '{}' } },
      ],
    };
    llm.chat.mockResolvedValue(toolTurn); // always asks for a tool -> never settles
    registry.dispatch.mockResolvedValue([]);

    const result = await service.chat('user-1', 'loop');

    expect(llm.chat).toHaveBeenCalledTimes(5);
    expect(result.reply).toMatch(/tidak dapat menyelesaikan/i);
  });
});
