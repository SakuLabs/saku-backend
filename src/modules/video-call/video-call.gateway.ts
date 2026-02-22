import { Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  MAX_PARTICIPANTS,
  SOCKET_NAMESPACE,
} from './video-call.interface';
import type {
  JoinRoomPayload,
  ReturnSignalEvent,
  RoomFullEvent,
  SendSignalPayload,
  UserJoinedEvent,
  UserLeftEvent,
} from './video-call.interface';
import { VideoCallService } from './video-call.service';
import { VideoCallWsJwtGuard } from './video-call-ws-jwt.guard';

@WebSocketGateway({
  namespace: SOCKET_NAMESPACE,
  cors: {
    origin: '*', // tighten in production: e.g. process.env.FRONTEND_URL
    credentials: true,
  },
  // Tuning for low-latency signaling (small messages, high frequency)
  transports: ['websocket'], // skip long-polling upgrade handshake
  pingInterval: 10_000,
  pingTimeout: 20_000,
})
@UseGuards(VideoCallWsJwtGuard)
export class VideoCallGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(VideoCallGateway.name);

  constructor(private readonly videoCallService: VideoCallService) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  afterInit(server: Server): void {
    this.logger.log(`VideoCall Gateway initialised on namespace "${SOCKET_NAMESPACE}"`);
  }

  handleConnection(client: Socket): void {
    const userId = this.extractUserId(client);
    this.logger.log(`Client connected: ${client.id} (userId: ${userId})`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.handleLeave(client);
  }

  // ── Event: join-room ───────────────────────────────────────────────────────
  //
  // Client emits:  { roomId: string, userId: string }
  // Server emits back to newcomer:     (nothing — they get user-joined per peer)
  // Server emits to each existing peer: 'user-joined' with newcomer info
  //
  @SubscribeMessage('join-room')
  onJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ): void {
    const { roomId, userId } = payload;

    const result = this.videoCallService.joinRoom(roomId, client.id, userId);

    if (!result.ok) {
      if (result.reason === 'room-full') {
        const event: RoomFullEvent = { roomId, maxParticipants: MAX_PARTICIPANTS };
        client.emit('room-full', event);
        this.logger.warn(`Room full — rejected ${client.id} from ${roomId}`);
      }

      if (result.reason === 'already-joined') {
        this.logger.warn(`${client.id} tried to join ${roomId} twice — ignored`);
      }
      return;
    }

    // Join the Socket.io room so we can broadcast efficiently later
    void client.join(roomId);

    const { room, newcomer } = result;

    // Tell each EXISTING participant about the newcomer.
    // They will initiate the WebRTC offer toward the newcomer.
    const existingParticipants = [...room.participants.values()].filter(
      (p) => p.socketId !== client.id,
    );

    existingParticipants.forEach((peer) => {
      const event: UserJoinedEvent = {
        socketId: newcomer.socketId,
        userId: newcomer.userId,
        existingParticipants: [], // not needed for existing peers
      };
      this.server.to(peer.socketId).emit('user-joined', event);
    });

    // Also tell the newcomer who is already in the room so the frontend
    // can display placeholders or prepare to receive offers.
    const userJoinedForNewcomer: UserJoinedEvent = {
      socketId: newcomer.socketId,
      userId: newcomer.userId,
      existingParticipants: existingParticipants.map((p) => ({
        socketId: p.socketId,
        userId: p.userId,
      })),
    };
    client.emit('room-participants', userJoinedForNewcomer);

    this.logger.log(
      `[${roomId}] ${userId} joined. Notified ${existingParticipants.length} peer(s).`,
    );
  }

  // ── Event: send-signal ─────────────────────────────────────────────────────
  //
  // Pure relay — gateway never inspects the signal body (SDP / ICE).
  // This keeps signaling latency to an absolute minimum: one Map lookup + emit.
  //
  // Client emits:  { to: socketId, signal: <WebRTC blob> }
  // Target peer receives: 'return-signal' { from: socketId, signal: <WebRTC blob> }
  //
  @SubscribeMessage('send-signal')
  onSendSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendSignalPayload,
  ): void {
    const { to, signal } = payload;

    // Security: sender must be in a room (already validated by guard + join)
    const senderRoom = this.videoCallService.getRoomBySocketId(client.id);
    if (!senderRoom) {
      this.logger.warn(`${client.id} tried to signal without being in a room`);
      return;
    }

    // Security: target must be in the SAME room
    const targetRoom = this.videoCallService.getRoomBySocketId(to);
    if (!targetRoom || targetRoom.roomId !== senderRoom.roomId) {
      this.logger.warn(`${client.id} tried to signal ${to} in a different room`);
      return;
    }

    const event: ReturnSignalEvent = { from: client.id, signal };
    this.server.to(to).emit('return-signal', event);
  }

  // ── Private: handle leave / disconnect ────────────────────────────────────

  private handleLeave(client: Socket): void {
    const result = this.videoCallService.leaveRoom(client.id);
    if (!result.ok) return;

    const { leftParticipant, room } = result;

    // Leave the Socket.io room
    if (room) {
      void client.leave(room.roomId);
    }

    // Notify remaining peers so they can clean up the video tile
    if (room) {
      const event: UserLeftEvent = {
        socketId: leftParticipant.socketId,
        userId: leftParticipant.userId,
      };
      this.server.to(room.roomId).emit('user-left', event);

      this.logger.log(
        `[${room.roomId}] Notified ${room.participants.size} peer(s) that ${leftParticipant.userId} left.`,
      );
    }
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private extractUserId(client: Socket): string {
    // JWT payload is attached by WsJwtGuard as client.data.user
    return (client.data?.user?.sub as string) ?? client.id;
  }
}
