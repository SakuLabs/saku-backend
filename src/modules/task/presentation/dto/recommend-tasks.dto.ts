import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RecommendTasksDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(15)
  @Max(1440)
  availableMinutes?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;

  @IsOptional()
  @IsIn(['auto', 'weighted', 'knapsack'])
  algorithm?: 'auto' | 'weighted' | 'knapsack';
}
