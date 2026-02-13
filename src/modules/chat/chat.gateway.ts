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
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token ||
      (client.handshake.headers.authorization || '').replace('Bearer ', '');
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // no-op
  }

  @SubscribeMessage('joinGroup')
  async onJoinGroup(
    @MessageBody() body: { groupId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !body?.groupId) return;
    const member = await this.chatService.isGroupMember(body.groupId, userId);
    if (!member) return;
    client.join(this.groupRoom(body.groupId));
  }

  @SubscribeMessage('joinDM')
  async onJoinDM(
    @MessageBody() body: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = client.data.userId as string | undefined;
    if (!currentUserId || !body?.userId) return;
    const ok = await this.chatService.areFriends(currentUserId, body.userId);
    if (!ok) return;
    client.join(this.dmRoom(currentUserId, body.userId));
  }

  @SubscribeMessage('sendGroupMessage')
  async onSendGroupMessage(
    @MessageBody() body: { groupId: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !body?.groupId || !body?.content?.trim()) return;
    const member = await this.chatService.isGroupMember(body.groupId, userId);
    if (!member) return;
    const message = await this.chatService.createGroupMessage(
      body.groupId,
      userId,
      body.content.trim(),
    );
    this.server.to(this.groupRoom(body.groupId)).emit('receive_message', message);
  }

  @SubscribeMessage('sendDM')
  async onSendDM(
    @MessageBody() body: { recipientId: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId as string | undefined;
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
    body: { type: 'dm' | 'group'; recipientId?: string; groupId?: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !body?.content?.trim()) return;
    if (body.type === 'group' && body.groupId) {
      const member = await this.chatService.isGroupMember(body.groupId, userId);
      if (!member) return;
      const message = await this.chatService.createGroupMessage(
        body.groupId,
        userId,
        body.content.trim(),
      );
      this.server.to(this.groupRoom(body.groupId)).emit('receive_message', message);
    }
    if (body.type === 'dm' && body.recipientId) {
      const ok = await this.chatService.areFriends(userId, body.recipientId);
      if (!ok) return;
      const message = await this.chatService.createDirectMessage(
        userId,
        body.recipientId,
        body.content.trim(),
      );
      this.server.to(this.dmRoom(userId, body.recipientId)).emit('receive_message', message);
    }
  }

  private groupRoom(groupId: string) {
    return `group:${groupId}`;
  }

  private dmRoom(a: string, b: string) {
    const [x, y] = [a, b].sort();
    return `dm:${x}:${y}`;
  }
}
