import { Module } from '@nestjs/common';
import { ScheduleController } from './presentation/schedule.controller';
import { CreateScheduleUseCase } from './application/use-cases/create-schedule.use-case';
import { PrismaScheduleRepository } from './infrastructure/persistence/prisma-schedule.repository';
import { IScheduleRepository } from './domain/schedule.repository.interface';
import { PrismaModule } from '../../../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [ScheduleController],
  providers: [
    CreateScheduleUseCase,
    JwtAuthGuard,
    {
      provide: 'IScheduleRepository',
      useClass: PrismaScheduleRepository,
    },
  ],
  exports: ['IScheduleRepository'],
})
export class ScheduleModule {}
