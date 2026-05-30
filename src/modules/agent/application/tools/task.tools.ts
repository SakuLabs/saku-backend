import { Inject, Injectable } from '@nestjs/common';
import { CreateTaskUseCase } from '../../../task/application/use-cases/create-task.use-case';
import type { ITaskRepository } from '../../../task/domain/task.repository.interface';
import {
  CreateTaskDto,
  TaskPriority,
} from '../../../task/presentation/dto/create-task.dto';
import { LlmToolDef } from '../../infrastructure/llm/llm.client';
import { ToolContext } from './schedule.tools';

type Args = Record<string, unknown>;

@Injectable()
export class TaskTools {
  constructor(
    private readonly createTaskUseCase: CreateTaskUseCase,
    @Inject('ITaskRepository') private readonly taskRepo: ITaskRepository,
  ) {}

  definitions(): LlmToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'create_task',
          description: 'Create a to-do task for the user.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              startDate: { type: 'string', description: 'ISO 8601 datetime' },
              deadline: { type: 'string', description: 'ISO 8601 datetime' },
              priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
              progress: { type: 'number' },
            },
            required: ['title'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_tasks',
          description: "List the user's tasks.",
          parameters: { type: 'object', properties: {} },
        },
      },
    ];
  }

  async createTask(args: Args, ctx: ToolContext): Promise<unknown> {
    const deadline = args.deadline as string | undefined;
    const priority =
      (args.priority as TaskPriority | undefined) ?? TaskPriority.MEDIUM;
    const dto: CreateTaskDto = {
      title: String(args.title),
      description: args.description as string | undefined,
      startDate: args.startDate as string | undefined,
      deadline,
      priority,
      progress: typeof args.progress === 'number' ? args.progress : undefined,
    };
    return this.createTaskUseCase.execute(dto, ctx.userId);
  }

  async listTasks(_args: Args, ctx: ToolContext): Promise<unknown> {
    return this.taskRepo.findAll(ctx.userId);
  }
}
