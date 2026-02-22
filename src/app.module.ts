import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { TaskModule } from './modules/task/task.module';
import { AuthModule } from './modules/auth/auth.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { SocialModule } from './modules/social/social.module';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { ChatModule } from './modules/chat/chat.module';
import { UserModule } from './modules/user/user.module';
import { VideoCallModule } from './modules/video-call/video-call.module';

@Module({
  imports: [
    PrismaModule,
    NestScheduleModule.forRoot(),
    TaskModule,
    AuthModule,
    ScheduleModule,
    SocialModule,
    ChatModule,
    UserModule,
    VideoCallModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
