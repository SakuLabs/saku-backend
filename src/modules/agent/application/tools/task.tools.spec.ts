import { TaskTools } from './task.tools';
import { CreateTaskUseCase } from '../../../task/application/use-cases/create-task.use-case';
import type { ITaskRepository } from '../../../task/domain/task.repository.interface';
import { Task, TaskStatus } from '../../../task/domain/task.entity';
import { TaskPriority } from '../../../task/presentation/dto/create-task.dto';

const makeTask = () =>
  new Task(
    't-1',
    'Write report',
    'desc',
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-12-01T00:00:00Z'),
    2,
    0,
    TaskStatus.TODO,
    new Date('2026-01-01T00:00:00Z'),
  );

describe('TaskTools', () => {
  let tools: TaskTools;
  let createUseCase: { execute: jest.Mock };
  let repo: jest.Mocked<ITaskRepository>;

  beforeEach(() => {
    createUseCase = { execute: jest.fn() };
    repo = {
      save: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<ITaskRepository>;
    tools = new TaskTools(createUseCase as unknown as CreateTaskUseCase, repo);
  });

  it('exposes definitions for create_task and list_tasks', () => {
    const names = tools.definitions().map((d) => d.function.name);
    expect(names).toEqual(expect.arrayContaining(['create_task', 'list_tasks']));
  });

  it('create_task defaults priority to MEDIUM and forwards deadline', async () => {
    createUseCase.execute.mockResolvedValue(makeTask());
    await tools.createTask(
      { title: 'Write report', deadline: '2026-12-01T00:00:00Z' },
      { userId: 'user-1' },
    );
    expect(createUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Write report',
        priority: TaskPriority.MEDIUM,
        deadline: '2026-12-01T00:00:00Z',
      }),
      'user-1',
    );
  });

  it('create_task passes through an explicit priority', async () => {
    createUseCase.execute.mockResolvedValue(makeTask());
    await tools.createTask(
      { title: 'Write report', priority: 'HIGH' },
      { userId: 'user-1' },
    );
    expect(createUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ priority: TaskPriority.HIGH }),
      'user-1',
    );
  });

  it('list_tasks returns only the user rows', async () => {
    repo.findAll.mockResolvedValue([makeTask()]);
    const result = (await tools.listTasks({}, { userId: 'user-1' })) as Task[];
    expect(repo.findAll).toHaveBeenCalledWith('user-1');
    expect(result).toHaveLength(1);
  });
});
