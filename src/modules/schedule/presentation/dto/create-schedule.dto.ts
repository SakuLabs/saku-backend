import { IsString, IsNotEmpty, IsDateString, IsOptional, IsEnum } from 'class-validator';
import { ScheduleType, ScheduleColor, ScheduleImportance } from '../../domain/schedule.entity';

export class CreateScheduleDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ScheduleType)
  type?: ScheduleType;

  @IsOptional()
  @IsEnum(ScheduleColor)
  color?: ScheduleColor;

  @IsOptional()
  @IsEnum(ScheduleImportance)
  importance?: ScheduleImportance;

  @IsOptional()
  progress?: number;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  taskIds?: string[];
}
