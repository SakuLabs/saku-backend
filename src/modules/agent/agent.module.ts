import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { TaskModule } from '../task/task.module';
import { AgentController } from './presentation/agent.controller';
import { AgentService } from './application/agent.service';
import { ToolRegistry } from './application/tools/tool-registry';
import { ScheduleTools } from './application/tools/schedule.tools';
import { TaskTools } from './application/tools/task.tools';
import { LlmClient } from './infrastructure/llm/llm.client';
import { PrismaConversationRepository } from './infrastructure/persistence/prisma-conversation.repository';

@Module({
  imports: [PrismaModule, ScheduleModule, TaskModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    ToolRegistry,
    ScheduleTools,
    TaskTools,
    LlmClient,
    {
      provide: 'IConversationRepository',
      useClass: PrismaConversationRepository,
    },
  ],
})
export class AgentModule {}
