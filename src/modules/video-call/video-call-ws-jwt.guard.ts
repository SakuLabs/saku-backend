import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class VideoCallWsJwtGuard implements CanActivate {
  private readonly logger = new Logger(VideoCallWsJwtGuard.name);

  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);

    if (!token) {
      this.logger.warn(`[${client.id}] Missing JWT token`);
      throw new WsException('Unauthorized: no token provided');
    }

    try {
      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      return true;
    } catch {
      this.logger.warn(`[${client.id}] Invalid JWT token`);
      throw new WsException('Unauthorized: invalid token');
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake?.auth?.token as string | undefined;
    if (authToken) return authToken;

    const authHeader = client.handshake?.headers?.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    const queryToken = client.handshake?.query?.token as string | undefined;
    if (queryToken) return queryToken;

    return null;
  }
}
