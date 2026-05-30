import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConversationRepository } from './prisma-conversation.repository';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  createPrismaMock,
  MockPrisma,
} from '../../../../../test/utils/prisma-mock';

describe('PrismaConversationRepository', () => {
  let repo: PrismaConversationRepository;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaConversationRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    repo = module.get(PrismaConversationRepository);
  });

  it('create returns a conversation summary', async () => {
    prisma.agentConversation.create.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      title: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as never);

    const result = await repo.create('u1');
    expect(result.id).toBe('c1');
    expect(result.userId).toBe('u1');
    expect(prisma.agentConversation.create).toHaveBeenCalledWith({
      data: { userId: 'u1', title: undefined },
    });
  });

  it('getMessages maps rows to ConversationMessage', async () => {
    prisma.agentMessage.findMany.mockResolvedValue([
      {
        id: 'm1',
        conversationId: 'c1',
        role: 'user',
        content: 'hi',
        toolCalls: null,
        toolCallId: null,
        createdAt: new Date(),
      },
      {
        id: 'm2',
        conversationId: 'c1',
        role: 'assistant',
        content: null,
        toolCalls: [
          { id: 'call_1', type: 'function', function: { name: 'list_tasks', arguments: '{}' } },
        ],
        toolCallId: null,
        createdAt: new Date(),
      },
    ] as never);

    const msgs = await repo.getMessages('c1');
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ role: 'user', content: 'hi', toolCalls: undefined, toolCallId: undefined });
    expect(msgs[1].toolCalls?.[0].function.name).toBe('list_tasks');
  });

  it('appendMessages writes rows and bumps updatedAt', async () => {
    await repo.appendMessages('c1', [
      { role: 'user', content: 'hi' },
      { role: 'tool', content: '{}', toolCallId: 'call_1' },
    ]);

    expect(prisma.agentMessage.createMany).toHaveBeenCalledWith({
      data: [
        { conversationId: 'c1', role: 'user', content: 'hi', toolCalls: undefined, toolCallId: undefined },
        { conversationId: 'c1', role: 'tool', content: '{}', toolCalls: undefined, toolCallId: 'call_1' },
      ],
    });
    expect(prisma.agentConversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {},
    });
  });
});
