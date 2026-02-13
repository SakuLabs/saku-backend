import { IsString, IsNotEmpty, IsDateString, IsNumber, Min, Max, IsOptional } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsDateString()
  deadline!: string;

  @IsNumber()
  @Min(1)
  @Max(3)
  priority!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;
}
