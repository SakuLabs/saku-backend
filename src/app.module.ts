import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthModule } from './common/jwt/jwt-auth.module';
import { TaskModule } from './modules/task/task.module';
import { AuthModule } from './modules/auth/auth.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { SocialModule } from './modules/social/social.module';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { ChatModule } from './modules/chat/chat.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    PrismaModule,
    JwtAuthModule,
    NestScheduleModule.forRoot(),
    TaskModule,
    AuthModule,
    ScheduleModule,
    SocialModule,
    ChatModule,
    UserModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
