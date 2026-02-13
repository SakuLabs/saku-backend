import { Schedule } from './schedule.entity';

export interface IScheduleRepository {
  save(schedule: Schedule): Promise<Schedule>;
  findById(id: string): Promise<Schedule | null>;
  findByUserId(userId: string): Promise<Schedule[]>;
  findInTimeRange(start: Date, end: Date, userId?: string): Promise<Schedule[]>;
  delete(id: string): Promise<void>;
}
