import { Module } from '@nestjs/common';
import { TaskController } from './presentation/task.controller';
import { CreateTaskUseCase } from './application/use-cases/create-task.use-case';
import { PrismaTaskRepository } from './infrastructure/persistence/prisma-task.repository';
import { TaskReminderService } from './infrastructure/scheduler/task-reminder.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [PrismaModule, ScheduleModule],
  controllers: [TaskController],
  providers: [
    CreateTaskUseCase,
    TaskReminderService,
    {
      provide: 'ITaskRepository',
      useClass: PrismaTaskRepository,
    },
  ],
  exports: ['ITaskRepository', CreateTaskUseCase],
})
export class TaskModule {}
