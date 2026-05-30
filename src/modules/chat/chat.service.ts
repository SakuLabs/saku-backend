import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async isGroupMember(groupId: string, userId: string) {
    return await this.prisma.groupMember.findFirst({
      where: { groupId, userId },
    });
  }

  async createGroupMessage(groupId: string, senderId: string, content: string) {
    return await this.prisma.message.create({
      data: { groupId, senderId, content },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async createDirectMessage(
    senderId: string,
    recipientId: string,
    content: string,
  ) {
    return await this.prisma.message.create({
      data: {
        senderId,
        recipientId,
        content,
        directMessageUserId: recipientId,
      },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async getGroupMessages(groupId: string, take = 50) {
    return await this.prisma.message.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      take,
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async getDirectMessages(userId: string, otherUserId: string, take = 50) {
    return await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, recipientId: otherUserId },
          { senderId: otherUserId, recipientId: userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take,
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async areFriends(userId: string, otherUserId: string) {
    const friendship = await this.prisma.userFriend.findFirst({
      where: {
        OR: [
          { userId, friendId: otherUserId },
          { userId: otherUserId, friendId: userId },
        ],
      },
    });
    return !!friendship;
  }

  async getFriendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userFriend.findMany({
      where: { userId },
      select: { friendId: true },
    });
    return rows.map((r) => r.friendId);
  }

  async getGroupMemberIds(groupId: string): Promise<string[]> {
    const rows = await this.prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  // ---- Unread tracking (persisted via ConversationRead) ----

  async markConversationRead(userId: string, conversationKey: string) {
    return await this.prisma.conversationRead.upsert({
      where: { userId_conversationKey: { userId, conversationKey } },
      update: { lastReadAt: new Date() },
      create: { userId, conversationKey, lastReadAt: new Date() },
    });
  }

  /**
   * Returns unread counts per conversation for a user.
   * conversationKey: "group:{groupId}" or "dm:{otherUserId}".
   * Only counts messages from other users created after lastReadAt.
   */
  async getUnreadCounts(
    userId: string,
  ): Promise<{ conversationKey: string; count: number }[]> {
    const reads = await this.prisma.conversationRead.findMany({
      where: { userId },
    });
    const readMap = new Map(reads.map((r) => [r.conversationKey, r.lastReadAt]));

    const result: { conversationKey: string; count: number }[] = [];

    // Group conversations the user belongs to
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    for (const { groupId } of memberships) {
      const key = `group:${groupId}`;
      const lastRead = readMap.get(key);
      const count = await this.prisma.message.count({
        where: {
          groupId,
          senderId: { not: userId },
          ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
        },
      });
      if (count > 0) result.push({ conversationKey: key, count });
    }

    // Direct conversations: group incoming DMs by sender
    const dmSenders = await this.prisma.message.groupBy({
      by: ['senderId'],
      where: { recipientId: userId },
    });
    for (const { senderId } of dmSenders) {
      const key = `dm:${senderId}`;
      const lastRead = readMap.get(key);
      const count = await this.prisma.message.count({
        where: {
          senderId,
          recipientId: userId,
          ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
        },
      });
      if (count > 0) result.push({ conversationKey: key, count });
    }

    return result;
  }
}
