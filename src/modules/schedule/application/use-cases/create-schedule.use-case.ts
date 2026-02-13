import { Injectable, Inject } from '@nestjs/common';
import { Schedule, ScheduleType, ScheduleColor, ScheduleImportance } from '../../domain/schedule.entity';
import type { IScheduleRepository } from '../../domain/schedule.repository.interface';
import { CreateScheduleDto } from '../../presentation/dto/create-schedule.dto';

@Injectable()
export class CreateScheduleUseCase {
  constructor(
    @Inject('IScheduleRepository') private readonly scheduleRepo: IScheduleRepository,
  ) {}

  async execute(data: CreateScheduleDto, userId: string): Promise<Schedule> {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    const newSchedule = new Schedule(
      Math.random().toString(36).substr(2, 9),
      data.title,
      start,
      end,
      data.type || ScheduleType.EVENT,
      data.color || ScheduleColor.PURPLE,
      data.importance || ScheduleImportance.NORMAL,
      typeof data.progress === 'number' ? data.progress : 0,
      data.description,
      userId,
      data.groupId,
    );

    return await this.scheduleRepo.save(newSchedule);
  }
}
