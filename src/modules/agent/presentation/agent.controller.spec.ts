import { BadRequestException } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from '../application/agent.service';
import type { IConversationRepository } from '../domain/conversation.repository.interface';

describe('AgentController', () => {
  let controller: AgentController;
  let service: { chat: jest.Mock };
  let convRepo: jest.Mocked<IConversationRepository>;

  beforeEach(() => {
    service = { chat: jest.fn() };
    convRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      listByUser: jest.fn(),
      getMessages: jest.fn(),
      appendMessages: jest.fn(),
    } as unknown as jest.Mocked<IConversationRepository>;
    controller = new AgentController(
      service as unknown as AgentService,
      convRepo,
    );
  });

  it('rejects unauthenticated chat requests', async () => {
    await expect(
      controller.chat({ content: 'hi' }, null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forwards chat to the service with the user id', async () => {
    service.chat.mockResolvedValue({
      conversationId: 'c1',
      reply: 'ok',
      actions: [],
    });
    const result = await controller.chat(
      { content: 'hi', conversationId: 'c1' },
      { sub: 'user-1' } as never,
    );
    expect(service.chat).toHaveBeenCalledWith('user-1', 'hi', 'c1');
    expect(result.reply).toBe('ok');
  });

  it('lists conversations for the authenticated user', async () => {
    convRepo.listByUser.mockResolvedValue([]);
    await controller.list({ sub: 'user-1' } as never);
    expect(convRepo.listByUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects unauthenticated list requests', async () => {
    await expect(controller.list(null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
