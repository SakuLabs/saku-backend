import { IsString, IsNotEmpty, IsDateString, IsNumber, Min, Max, IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export class CreateTaskDto {
// TITLE, DESCRIPTION, DEADLINE, PRIORITY, PROGRESS


  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  // Accepted to prevent ValidationPipe (forbidNonWhitelisted) from rejecting
  // frontend payloads that include groupId when creating group tasks.
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @Transform(({ obj }) => obj.deadline || obj.dueDate)
  deadlineOrDueDate?: string;

  @IsEnum(TaskPriority)
  priority!: TaskPriority;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;
}
