import { Injectable } from '@nestjs/common';
import { LlmToolDef } from '../../infrastructure/llm/llm.client';
import { ScheduleTools, ToolContext } from './schedule.tools';
import { TaskTools } from './task.tools';

type Handler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>;

@Injectable()
export class ToolRegistry {
  private readonly handlers: Record<string, Handler>;

  constructor(
    private readonly scheduleTools: ScheduleTools,
    private readonly taskTools: TaskTools,
  ) {
    this.handlers = {
      create_schedule: (a, c) => this.scheduleTools.createSchedule(a, c),
      list_schedules: (a, c) => this.scheduleTools.listSchedules(a, c),
      check_conflicts: (a, c) => this.scheduleTools.checkConflicts(a, c),
      update_schedule: (a, c) => this.scheduleTools.updateSchedule(a, c),
      delete_schedule: (a, c) => this.scheduleTools.deleteSchedule(a, c),
      create_task: (a, c) => this.taskTools.createTask(a, c),
      list_tasks: (a, c) => this.taskTools.listTasks(a, c),
    };
  }

  definitions(): LlmToolDef[] {
    return [
      ...this.scheduleTools.definitions(),
      ...this.taskTools.definitions(),
    ];
  }

  async dispatch(
    name: string,
    argumentsJson: string,
    ctx: ToolContext,
  ): Promise<unknown> {
    const handler = this.handlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    let args: Record<string, unknown>;
    try {
      args = argumentsJson ? JSON.parse(argumentsJson) : {};
    } catch {
      throw new Error(`Invalid tool arguments for ${name}`);
    }
    return handler(args, ctx);
  }
}
