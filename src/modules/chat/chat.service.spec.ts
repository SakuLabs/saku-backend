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
});
