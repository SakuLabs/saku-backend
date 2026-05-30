import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../../../test/utils/prisma-mock';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ChatService);
  });

  describe('isGroupMember', () => {
    it('queries by groupId and userId', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({ id: 'm1' } as any);
      const result = await service.isGroupMember('g1', 'u1');
      expect(prisma.groupMember.findFirst).toHaveBeenCalledWith({
        where: { groupId: 'g1', userId: 'u1' },
      });
      expect(result).toEqual({ id: 'm1' });
    });
  });

  describe('createGroupMessage', () => {
    it('creates message with groupId, senderId, content and includes sender', async () => {
      prisma.message.create.mockResolvedValueOnce({ id: 'msg' } as any);
      await service.createGroupMessage('g1', 'u1', 'hi');
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { groupId: 'g1', senderId: 'u1', content: 'hi' },
        include: {
          sender: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
    });
  });

  describe('createDirectMessage', () => {
    it('creates DM with sender/recipient and directMessageUserId=recipient', async () => {
      prisma.message.create.mockResolvedValueOnce({ id: 'msg' } as any);
      await service.createDirectMessage('u1', 'u2', 'yo');
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          senderId: 'u1',
          recipientId: 'u2',
          content: 'yo',
          directMessageUserId: 'u2',
        },
        include: {
          sender: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
    });
  });

  describe('getGroupMessages', () => {
    it('defaults take to 50, orders asc', async () => {
      prisma.message.findMany.mockResolvedValueOnce([] as any);
      await service.getGroupMessages('g1');
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { groupId: 'g1' },
        orderBy: { createdAt: 'asc' },
        take: 50,
        include: {
          sender: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
    });

    it('respects custom take', async () => {
      prisma.message.findMany.mockResolvedValueOnce([] as any);
      await service.getGroupMessages('g1', 10);
      const arg = prisma.message.findMany.mock.calls[0][0] as any;
      expect(arg.take).toBe(10);
    });
  });

  describe('getDirectMessages', () => {
    it('queries OR(sender→recipient | recipient→sender)', async () => {
      prisma.message.findMany.mockResolvedValueOnce([] as any);
      await service.getDirectMessages('u1', 'u2');
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { senderId: 'u1', recipientId: 'u2' },
            { senderId: 'u2', recipientId: 'u1' },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
        include: {
          sender: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
    });
  });

  describe('areFriends', () => {
    it('returns true when friendship row exists', async () => {
      prisma.userFriend.findFirst.mockResolvedValueOnce({ id: 'f1' } as any);
      expect(await service.areFriends('u1', 'u2')).toBe(true);
    });

    it('returns false when not friends', async () => {
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      expect(await service.areFriends('u1', 'u2')).toBe(false);
    });

    it('checks both directions', async () => {
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      await service.areFriends('u1', 'u2');
      expect(prisma.userFriend.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { userId: 'u1', friendId: 'u2' },
            { userId: 'u2', friendId: 'u1' },
          ],
        },
      });
    });
  });

  describe('getFriendIds', () => {
    it('returns friendId list', async () => {
      prisma.userFriend.findMany.mockResolvedValueOnce([
        { friendId: 'f1' },
        { friendId: 'f2' },
      ] as any);
      const ids = await service.getFriendIds('u1');
      expect(prisma.userFriend.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        select: { friendId: true },
      });
      expect(ids).toEqual(['f1', 'f2']);
    });
  });

  describe('getGroupMemberIds', () => {
    it('returns userId list', async () => {
      prisma.groupMember.findMany.mockResolvedValueOnce([
        { userId: 'u1' },
        { userId: 'u2' },
      ] as any);
      const ids = await service.getGroupMemberIds('g1');
      expect(prisma.groupMember.findMany).toHaveBeenCalledWith({
        where: { groupId: 'g1' },
        select: { userId: true },
      });
      expect(ids).toEqual(['u1', 'u2']);
    });
  });

  describe('markConversationRead', () => {
    it('upserts lastReadAt for user+conversationKey', async () => {
      prisma.conversationRead.upsert.mockResolvedValueOnce({ id: 'r1' } as any);
      await service.markConversationRead('u1', 'group:g1');
      const arg = prisma.conversationRead.upsert.mock.calls[0][0] as any;
      expect(arg.where).toEqual({
        userId_conversationKey: { userId: 'u1', conversationKey: 'group:g1' },
      });
      expect(arg.create.userId).toBe('u1');
      expect(arg.create.conversationKey).toBe('group:g1');
      expect(arg.update.lastReadAt).toBeInstanceOf(Date);
    });
  });

  describe('getUnreadCounts', () => {
    it('counts group + dm messages after lastReadAt, excluding own', async () => {
      prisma.conversationRead.findMany.mockResolvedValueOnce([
        { conversationKey: 'group:g1', lastReadAt: new Date('2020-01-01') },
      ] as any);
      prisma.groupMember.findMany.mockResolvedValueOnce([
        { groupId: 'g1' },
      ] as any);
      // group unread count
      prisma.message.count.mockResolvedValueOnce(3 as any);
      prisma.message.groupBy.mockResolvedValueOnce([
        { senderId: 's2' },
      ] as any);
      // dm unread count (no lastRead → counts all)
      prisma.message.count.mockResolvedValueOnce(2 as any);

      const result = await service.getUnreadCounts('u1');

      expect(result).toEqual([
        { conversationKey: 'group:g1', count: 3 },
        { conversationKey: 'dm:s2', count: 2 },
      ]);
      // group count query uses lastRead gt + excludes own
      const groupCountArg = prisma.message.count.mock.calls[0][0] as any;
      expect(groupCountArg.where.groupId).toBe('g1');
      expect(groupCountArg.where.senderId).toEqual({ not: 'u1' });
      expect(groupCountArg.where.createdAt).toEqual({ gt: new Date('2020-01-01') });
      // dm count query without lastRead has no createdAt filter
      const dmCountArg = prisma.message.count.mock.calls[1][0] as any;
      expect(dmCountArg.where.senderId).toBe('s2');
      expect(dmCountArg.where.recipientId).toBe('u1');
      expect(dmCountArg.where.createdAt).toBeUndefined();
    });

    it('omits conversations with zero unread', async () => {
      prisma.conversationRead.findMany.mockResolvedValueOnce([] as any);
      prisma.groupMember.findMany.mockResolvedValueOnce([
        { groupId: 'g1' },
      ] as any);
      prisma.message.count.mockResolvedValueOnce(0 as any);
      prisma.message.groupBy.mockResolvedValueOnce([] as any);

      const result = await service.getUnreadCounts('u1');
      expect(result).toEqual([]);
    });

    it('applies lastReadAt to DM and counts all when group has no read row', async () => {
      prisma.conversationRead.findMany.mockResolvedValueOnce([
        { conversationKey: 'dm:s2', lastReadAt: new Date('2021-06-01') },
      ] as any);
      prisma.groupMember.findMany.mockResolvedValueOnce([
        { groupId: 'g1' },
      ] as any);
      // group has no read row → no createdAt filter
      prisma.message.count.mockResolvedValueOnce(1 as any);
      prisma.message.groupBy.mockResolvedValueOnce([
        { senderId: 's2' },
      ] as any);
      // dm has a read row → createdAt gt filter applied
      prisma.message.count.mockResolvedValueOnce(5 as any);

      const result = await service.getUnreadCounts('u1');
      expect(result).toEqual([
        { conversationKey: 'group:g1', count: 1 },
        { conversationKey: 'dm:s2', count: 5 },
      ]);
      const groupArg = prisma.message.count.mock.calls[0][0] as any;
      expect(groupArg.where.createdAt).toBeUndefined();
      const dmArg = prisma.message.count.mock.calls[1][0] as any;
      expect(dmArg.where.createdAt).toEqual({ gt: new Date('2021-06-01') });
    });
  });
});
