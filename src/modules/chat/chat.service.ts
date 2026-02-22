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
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
    });
  }

  async createDirectMessage(senderId: string, recipientId: string, content: string) {
    return await this.prisma.message.create({
      data: { senderId, recipientId, content, directMessageUserId: recipientId },
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
    });
  }

  async getGroupMessages(groupId: string, take = 50) {
    const rows = await this.prisma.message.findMany({
      where: { groupId },
      // Fetch newest messages first, then reverse for chronological rendering.
      orderBy: { createdAt: 'desc' },
      take,
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
    });
    return rows.reverse();
  }

  async getDirectMessages(userId: string, otherUserId: string, take = 50) {
    const rows = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, recipientId: otherUserId },
          { senderId: otherUserId, recipientId: userId },
        ],
      },
      // Fetch newest messages first, then reverse for chronological rendering.
      orderBy: { createdAt: 'desc' },
      take,
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
    });
    return rows.reverse();
  }

  async markDirectMessagesAsRead(currentUserId: string, otherUserId: string) {
    await this.prisma.message.updateMany({
      where: {
        senderId: otherUserId,
        recipientId: currentUserId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  async getDirectUnreadCounts(userId: string) {
    const rows = await this.prisma.message.groupBy({
      by: ['senderId'],
      where: {
        recipientId: userId,
        readAt: null,
      },
      _count: {
        id: true,
      },
    });

    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.senderId] = row._count.id;
      return acc;
    }, {});
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
}
