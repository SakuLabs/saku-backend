import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

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
      data: { senderId, recipientId, content },
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
    });
  }

  async getGroupMessages(groupId: string, take = 50) {
    return await this.prisma.message.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      take,
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
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
      include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
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
}
