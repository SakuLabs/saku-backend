import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateScheduleUseCase } from '../../../schedule/application/use-cases/create-schedule.use-case';
import type { IScheduleRepository } from '../../../schedule/domain/schedule.repository.interface';
import {
  Schedule,
  ScheduleColor,
  ScheduleImportance,
  ScheduleType,
} from '../../../schedule/domain/schedule.entity';
import { CreateScheduleDto } from '../../../schedule/presentation/dto/create-schedule.dto';
import { LlmToolDef } from '../../infrastructure/llm/llm.client';

export interface ToolContext {
  userId: string;
}

type Args = Record<string, unknown>;

@Injectable()
export class ScheduleTools {
  constructor(
    private readonly createScheduleUseCase: CreateScheduleUseCase,
    @Inject('IScheduleRepository')
    private readonly scheduleRepo: IScheduleRepository,
  ) {}

  definitions(): LlmToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'create_schedule',
          description:
            "Create a new schedule/appointment in the user's calendar.",
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              startTime: { type: 'string', description: 'ISO 8601 datetime' },
              endTime: { type: 'string', description: 'ISO 8601 datetime' },
              description: { type: 'string' },
              type: { type: 'string', enum: ['EVENT', 'MEETING', 'TASK_REMINDER'] },
              color: { type: 'string', enum: ['purple', 'blue', 'green', 'orange', 'red'] },
              importance: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH'] },
            },
            required: ['title', 'startTime', 'endTime'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_schedules',
          description:
            "List the user's schedules, optionally within a time range.",
          parameters: {
            type: 'object',
            properties: {
              start: { type: 'string', description: 'ISO 8601 datetime' },
              end: { type: 'string', description: 'ISO 8601 datetime' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_conflicts',
          description:
            'Check whether a proposed time range conflicts with existing schedules.',
          parameters: {
            type: 'object',
            properties: {
              startTime: { type: 'string', description: 'ISO 8601 datetime' },
              endTime: { type: 'string', description: 'ISO 8601 datetime' },
            },
            required: ['startTime', 'endTime'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_schedule',
          description:
            'Update an existing schedule the user owns (reschedule, rename, change progress).',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              startTime: { type: 'string', description: 'ISO 8601 datetime' },
              endTime: { type: 'string', description: 'ISO 8601 datetime' },
              description: { type: 'string' },
              type: { type: 'string', enum: ['EVENT', 'MEETING', 'TASK_REMINDER'] },
              color: { type: 'string', enum: ['purple', 'blue', 'green', 'orange', 'red'] },
              importance: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH'] },
              progress: { type: 'number' },
            },
            required: ['id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_schedule',
          description: 'Delete a schedule the user owns.',
          parameters: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
      },
    ];
  }

  async createSchedule(args: Args, ctx: ToolContext): Promise<unknown> {
    const dto: CreateScheduleDto = {
      title: String(args.title),
      startTime: String(args.startTime),
      endTime: String(args.endTime),
      description: args.description as string | undefined,
      type: args.type as ScheduleType | undefined,
      color: args.color as ScheduleColor | undefined,
      importance: args.importance as ScheduleImportance | undefined,
    };
    return this.createScheduleUseCase.execute(dto, ctx.userId);
  }

  async listSchedules(args: Args, ctx: ToolContext): Promise<unknown> {
    if (args.start && args.end) {
      return this.scheduleRepo.findInTimeRange(
        new Date(String(args.start)),
        new Date(String(args.end)),
        ctx.userId,
      );
    }
    return this.scheduleRepo.findByUserId(ctx.userId);
  }

  async checkConflicts(args: Args, ctx: ToolContext): Promise<unknown> {
    const conflicts = await this.scheduleRepo.findInTimeRange(
      new Date(String(args.startTime)),
      new Date(String(args.endTime)),
      ctx.userId,
    );
    return { hasConflict: conflicts.length > 0, conflicts };
  }

  async updateSchedule(args: Args, ctx: ToolContext): Promise<unknown> {
    const existing = await this.loadOwned(String(args.id), ctx.userId);
    const updated = new Schedule(
      existing.id,
      (args.title as string) ?? existing.title,
      args.startTime ? new Date(String(args.startTime)) : existing.startTime,
      args.endTime ? new Date(String(args.endTime)) : existing.endTime,
      (args.type as ScheduleType) ?? existing.type,
      (args.color as ScheduleColor) ?? existing.color,
      (args.importance as ScheduleImportance) ?? existing.importance,
      typeof args.progress === 'number' ? args.progress : existing.progress,
      (args.description as string) ?? existing.description,
      existing.userId,
      existing.groupId,
    );
    return this.scheduleRepo.save(updated);
  }

  async deleteSchedule(args: Args, ctx: ToolContext): Promise<unknown> {
    const existing = await this.loadOwned(String(args.id), ctx.userId);
    await this.scheduleRepo.delete(existing.id);
    return { deleted: true, id: existing.id };
  }

  private async loadOwned(id: string, userId: string): Promise<Schedule> {
    const existing = await this.scheduleRepo.findById(id);
    if (!existing) {
      throw new NotFoundException('Schedule tidak ditemukan');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('Tidak memiliki akses ke schedule ini');
    }
    return existing;
  }
}
