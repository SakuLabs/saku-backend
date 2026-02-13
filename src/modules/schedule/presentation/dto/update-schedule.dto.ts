import { IsOptional, IsString, IsDateString, IsNumber, Min, Max } from 'class-validator';
import { ScheduleImportance } from '../../domain/schedule.entity';

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  importance?: ScheduleImportance;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  taskIds?: string[];
}
