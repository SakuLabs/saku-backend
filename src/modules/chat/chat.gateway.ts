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

type AuthedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  { userId?: string }
>;

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  handleConnection(client: AuthedSocket) {
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
      client.data.userId = payload.sub;
      void client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: AuthedSocket) {
    // no-op
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
