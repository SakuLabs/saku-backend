import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import type { Server } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import type { JwtPayload } from '../../common/types/jwt-payload';
import { getCorsOrigins } from '../../common/cors';

type AuthedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  { userId?: string }
>;

@WebSocketGateway({
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server: Server;

  // In-memory presence: userId -> set of connected socket ids.
  // Single-server only (default in-memory adapter); resets on restart.
  private readonly onlineUsers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  /** Emit an event to a user's personal room (all their connected sockets). */
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  async handleConnection(client: AuthedSocket) {
    const rawToken = client.handshake.auth?.token as string | undefined;
    const headerToken = (client.handshake.headers.authorization || '').replace(
      'Bearer ',
      '',
    );
    const token = rawToken || headerToken;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      const userId = payload.sub;
      client.data.userId = userId;
      void client.join(`user:${userId}`);
      await this.trackPresence(userId, client.id);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    const userId = client.data.userId;
    if (!userId) return;
    const sockets = this.onlineUsers.get(userId);
    if (!sockets) return;
    sockets.delete(client.id);
    if (sockets.size === 0) {
      this.onlineUsers.delete(userId);
      await this.broadcastPresence(userId, false);
    }
  }

  private async trackPresence(userId: string, socketId: string) {
    const existing = this.onlineUsers.get(userId);
    if (existing) {
      existing.add(socketId);
      return; // already online, no broadcast needed
    }
    this.onlineUsers.set(userId, new Set([socketId]));
    await this.broadcastPresence(userId, true);
  }

  /** Tell a user's friends that they came online / went offline. */
  private async broadcastPresence(userId: string, online: boolean) {
    const friendIds = await this.chatService.getFriendIds(userId);
    for (const friendId of friendIds) {
      this.emitToUser(friendId, 'presence:update', { userId, online });
    }
  }

  @SubscribeMessage('presence:sync')
  async onPresenceSync(@ConnectedSocket() client: AuthedSocket) {
    const userId = client.data.userId;
    if (!userId) return { online: [] };
    const friendIds = await this.chatService.getFriendIds(userId);
    const online = friendIds.filter((id) => this.onlineUsers.has(id));
    return { online };
  }

  @SubscribeMessage('joinGroup')
  async onJoinGroup(
    @MessageBody() body: { groupId: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const userId = client.data.userId;
    if (!userId || !body?.groupId) return;
    const member = await this.chatService.isGroupMember(body.groupId, userId);
    if (!member) return;
    void client.join(this.groupRoom(body.groupId));
  }

  @SubscribeMessage('joinDM')
  async onJoinDM(
    @MessageBody() body: { userId: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const currentUserId = client.data.userId;
    if (!currentUserId || !body?.userId) return;
    const ok = await this.chatService.areFriends(currentUserId, body.userId);
    if (!ok) return;
    void client.join(this.dmRoom(currentUserId, body.userId));
  }

  @SubscribeMessage('sendGroupMessage')
  async onSendGroupMessage(
    @MessageBody() body: { groupId: string; content: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const userId = client.data.userId;
    if (!userId || !body?.groupId || !body?.content?.trim()) return;
    const member = await this.chatService.isGroupMember(body.groupId, userId);
    if (!member) return;
    const message = await this.chatService.createGroupMessage(
      body.groupId,
      userId,
      body.content.trim(),
    );
    this.server
      .to(this.groupRoom(body.groupId))
      .emit('receive_message', message);
    await this.notifyGroupParticipants(body.groupId, userId, message);
  }

  @SubscribeMessage('sendDM')
  async onSendDM(
    @MessageBody() body: { recipientId: string; content: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const userId = client.data.userId;
    if (!userId || !body?.recipientId || !body?.content?.trim()) return;
    const ok = await this.chatService.areFriends(userId, body.recipientId);
    if (!ok) return;
    const message = await this.chatService.createDirectMessage(
      userId,
      body.recipientId,
      body.content.trim(),
    );
    const room = this.dmRoom(userId, body.recipientId);
    this.server.to(room).emit('receive_message', message);
    // Notify recipient on their personal room so badges/toasts update app-wide,
    // even when they don't have this DM open. Key = the OTHER party (sender).
    this.emitToUser(body.recipientId, 'message_notification', {
      conversationKey: `dm:${userId}`,
      message,
    });
  }

  @SubscribeMessage('send_message')
  async onSendMessage(
    @MessageBody()
    body: {
      type: 'dm' | 'group';
      recipientId?: string;
      groupId?: string;
      content: string;
    },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const userId = client.data.userId;
    if (!userId || !body?.content?.trim()) return;
    if (body.type === 'group' && body.groupId) {
      const member = await this.chatService.isGroupMember(body.groupId, userId);
      if (!member) return;
      const message = await this.chatService.createGroupMessage(
        body.groupId,
        userId,
        body.content.trim(),
      );
      this.server
        .to(this.groupRoom(body.groupId))
        .emit('receive_message', message);
      await this.notifyGroupParticipants(body.groupId, userId, message);
    }
    if (body.type === 'dm' && body.recipientId) {
      const ok = await this.chatService.areFriends(userId, body.recipientId);
      if (!ok) return;
      const message = await this.chatService.createDirectMessage(
        userId,
        body.recipientId,
        body.content.trim(),
      );
      this.server
        .to(this.dmRoom(userId, body.recipientId))
        .emit('receive_message', message);
      this.emitToUser(body.recipientId, 'message_notification', {
        conversationKey: `dm:${userId}`,
        message,
      });
    }
  }

  /** Notify every group member except the sender on their personal room. */
  private async notifyGroupParticipants(
    groupId: string,
    senderId: string,
    message: unknown,
  ) {
    const memberIds = await this.chatService.getGroupMemberIds(groupId);
    for (const memberId of memberIds) {
      if (memberId === senderId) continue;
      this.emitToUser(memberId, 'message_notification', {
        conversationKey: `group:${groupId}`,
        message,
      });
    }
  }

  @SubscribeMessage('typing')
  async onTyping(
    @MessageBody()
    body: { isTyping: boolean; groupId?: string; directMessageUserId?: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    // Broadcast typing status to relevant room
    if (body.groupId) {
      const member = await this.chatService.isGroupMember(body.groupId, userId);
      if (!member) return;
      this.server.to(this.groupRoom(body.groupId)).emit('typing', {
        userId,
        isTyping: body.isTyping,
        groupId: body.groupId,
      });
    } else if (body.directMessageUserId) {
      const ok = await this.chatService.areFriends(
        userId,
        body.directMessageUserId,
      );
      if (!ok) return;
      const room = this.dmRoom(userId, body.directMessageUserId);
      this.server.to(room).emit('typing', {
        userId,
        isTyping: body.isTyping,
        directMessageUserId: body.directMessageUserId,
      });
    }
  }

  @SubscribeMessage('friendRequest')
  async onFriendRequest(
    @MessageBody()
    body: { recipientId: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const userId = client.data.userId;
    if (!userId || !body?.recipientId) return;

    // Find recipient's socket and send friend request notification
    const recipientSockets = await this.server
      .in(`user:${body.recipientId}`)
      .fetchSockets();
    recipientSockets.forEach((socket) => {
      socket.emit('friendRequest', {
        senderId: userId,
        recipientId: body.recipientId,
      });
    });
  }

  private groupRoom(groupId: string) {
    return `group:${groupId}`;
  }

  private dmRoom(a: string, b: string) {
    const [x, y] = [a, b].sort();
    return `dm:${x}:${y}`;
  }
}
