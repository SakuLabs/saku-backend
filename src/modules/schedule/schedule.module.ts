import { Module } from '@nestjs/common';
import { ScheduleController } from './presentation/schedule.controller';
import { CreateScheduleUseCase } from './application/use-cases/create-schedule.use-case';
import { PrismaScheduleRepository } from './infrastructure/persistence/prisma-schedule.repository';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ScheduleController],
  providers: [
    CreateScheduleUseCase,
    {
      provide: 'IScheduleRepository',
      useClass: PrismaScheduleRepository,
    },
  ],
  exports: ['IScheduleRepository', CreateScheduleUseCase],
})
export class ScheduleModule {}
