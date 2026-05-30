import { ToolRegistry } from './tool-registry';
import { ScheduleTools } from './schedule.tools';
import { TaskTools } from './task.tools';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let scheduleTools: jest.Mocked<Partial<ScheduleTools>>;
  let taskTools: jest.Mocked<Partial<TaskTools>>;

  beforeEach(() => {
    scheduleTools = {
      definitions: jest.fn().mockReturnValue([
        {
          type: 'function',
          function: {
            name: 'create_schedule',
            description: '',
            parameters: {},
          },
        },
      ]),
      createSchedule: jest.fn().mockResolvedValue({ ok: 'sched' }),
    };
    taskTools = {
      definitions: jest.fn().mockReturnValue([
        {
          type: 'function',
          function: { name: 'list_tasks', description: '', parameters: {} },
        },
      ]),
      listTasks: jest.fn().mockResolvedValue([]),
    };
    registry = new ToolRegistry(
      scheduleTools as unknown as ScheduleTools,
      taskTools as unknown as TaskTools,
    );
  });

  it('aggregates definitions from all tool groups', () => {
    const names = registry.definitions().map((d) => d.function.name);
    expect(names).toEqual(['create_schedule', 'list_tasks']);
  });

  it('dispatches by name, parsing JSON arguments, with the user context', async () => {
    const result = await registry.dispatch('create_schedule', '{"title":"x"}', {
      userId: 'user-1',
    });
    expect(scheduleTools.createSchedule).toHaveBeenCalledWith(
      { title: 'x' },
      { userId: 'user-1' },
    );
    expect(result).toEqual({ ok: 'sched' });
  });

  it('throws on an unknown tool name', async () => {
    await expect(
      registry.dispatch('nope', '{}', { userId: 'user-1' }),
    ).rejects.toThrow('Unknown tool: nope');
  });

  it('throws on malformed JSON arguments', async () => {
    await expect(
      registry.dispatch('create_schedule', '{not json', { userId: 'user-1' }),
    ).rejects.toThrow(/arguments/i);
  });
});
