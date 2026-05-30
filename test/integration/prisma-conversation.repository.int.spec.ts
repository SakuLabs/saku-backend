import { PrismaConversationRepository } from '../../src/modules/agent/infrastructure/persistence/prisma-conversation.repository';
import {
  bootPostgres,
  teardownPostgres,
  IntegrationContext,
} from './postgres-container';

describe('PrismaConversationRepository (integration)', () => {
  let ctx: IntegrationContext;
  let repo: PrismaConversationRepository;
  let userId: string;

  beforeAll(async () => {
    ctx = await bootPostgres();
    repo = new PrismaConversationRepository(ctx.prisma);
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownPostgres(ctx);
  }, 30_000);

  beforeEach(async () => {
    await ctx.prisma.agentMessage.deleteMany();
    await ctx.prisma.agentConversation.deleteMany();
    await ctx.prisma.user.deleteMany();

    const u = await ctx.prisma.user.create({
      data: {
        email: `u-${Date.now()}@x.com`,
        password: 'x',
        name: 'Alice',
        userCode: `SU${Date.now()}`,
      },
    });
    userId = u.id;
  });

  it('creates a conversation, appends messages, and reads them back in order', async () => {
    const conv = await repo.create(userId, 'My day');
    expect(conv.id).toBeDefined();

    await repo.appendMessages(conv.id, [
      { role: 'user', content: 'book a meeting tomorrow' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          { id: 'call_1', type: 'function', function: { name: 'create_schedule', arguments: '{}' } },
        ],
      },
      { role: 'tool', content: '{"ok":true}', toolCallId: 'call_1' },
    ]);

    const msgs = await repo.getMessages(conv.id);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(msgs[1].toolCalls?.[0].function.name).toBe('create_schedule');
    expect(msgs[2].toolCallId).toBe('call_1');

    const list = await repo.listByUser(userId);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('My day');
  });

  it('findById returns null for unknown id', async () => {
    expect(await repo.findById('does-not-exist')).toBeNull();
  });
});
