// ─────────────────────────────────────────────────────────────────────────────
// video-call.module.ts
// ─────────────────────────────────────────────────────────────────────────────

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { VideoCallGateway } from './video-call.gateway';
import { VideoCallService } from './video-call.service';
import { VideoCallWsJwtGuard } from './video-call-ws-jwt.guard';

@Module({
  imports: [
    // JwtModule is needed by WsJwtGuard.
    // If your app already has a global JwtModule, you can remove this import
    // and inject JwtService directly from the global scope.
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [
    VideoCallGateway,
    VideoCallService,
    VideoCallWsJwtGuard,
  ],
  exports: [VideoCallService], // export if other modules need room info
})
export class VideoCallModule {}
