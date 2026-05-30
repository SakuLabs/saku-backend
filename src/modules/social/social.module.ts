import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [PrismaModule, ChatModule],
  controllers: [SocialController],
})
export class SocialModule {}
