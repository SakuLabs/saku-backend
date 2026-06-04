import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LlmProxyController } from './llm-proxy.controller';
import { LlmProxyUsageService } from './llm-proxy-usage.service';

@Module({
  imports: [PrismaModule],
  controllers: [LlmProxyController],
  providers: [LlmProxyUsageService],
})
export class DevModule {}
