import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CreateTaskUseCase } from './create-task.use-case';
import { Task, TaskStatus } from '../../domain/task.entity';
import type { ITaskRepository } from '../../domain/task.repository.interface';
import {
  CreateTaskDto,
  TaskPriority,
} from '../../presentation/dto/create-task.dto';

describe('CreateTaskUseCase', () => {
  let useCase: CreateTaskUseCase;
  let repo: jest.Mocked<ITaskRepository>;

  const baseDto = (overrides: Partial<CreateTaskDto> = {}): CreateTaskDto => ({
    title: 'A valid task title',
    priority: TaskPriority.MEDIUM,
    ...overrides,
  });

  beforeEach(async () => {
    repo = {
      save: jest.fn(),
    } as unknown as jest.Mocked<ITaskRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateTaskUseCase,
        { provide: 'ITaskRepository', useValue: repo },
      ],
    }).compile();

    useCase = module.get(CreateTaskUseCase);
  });

  it('throws BadRequest when userId missing', async () => {
    await expect(useCase.execute(baseDto(), '')).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('creates Task with defaults and saves via repo', async () => {
    const result = await useCase.execute(baseDto(), 'user-1');

    expect(result).toBeInstanceOf(Task);
    expect(result.title).toBe('A valid task title');
    expect(result.description).toBe('');
    expect(result.priority).toBe(2);
    expect(result.progress).toBe(0);
    expect(result.status).toBe(TaskStatus.TODO);
    expect(repo.save).toHaveBeenCalledWith(result, 'user-1');
  });

  it('uses deadlineOrDueDate when provided', async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await useCase.execute(
      baseDto({ deadlineOrDueDate: deadline.toISOString() }),
      'user-1',
    );
    expect(result.deadline.getTime()).toBe(deadline.getTime());
  });

  it('rejects deadline in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    await expect(
      useCase.execute(baseDto({ deadlineOrDueDate: past }), 'user-1'),
    ).rejects.toThrow(/Deadline/);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('defaults deadline to 7 days when neither provided', async () => {
    const before = Date.now();
    const result = await useCase.execute(baseDto(), 'user-1');
    const delta = result.deadline.getTime() - before;
    expect(delta).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(delta).toBeLessThan(8 * 24 * 60 * 60 * 1000);
  });

  it.each([
    [TaskPriority.LOW, 1],
    [TaskPriority.MEDIUM, 2],
    [TaskPriority.HIGH, 3],
  ])('maps %s priority to %i', async (priority, expected) => {
    const result = await useCase.execute(baseDto({ priority }), 'user-1');
    expect(result.priority).toBe(expected);
  });

  it('falls back to MEDIUM(2) for unknown priority value', async () => {
    const result = await useCase.execute(
      baseDto({ priority: 'UNKNOWN' as TaskPriority }),
      'user-1',
    );
    expect(result.priority).toBe(2);
  });

  it('honors numeric progress when supplied', async () => {
    const result = await useCase.execute(baseDto({ progress: 25 }), 'user-1');
    expect(result.progress).toBe(25);
    // since progress > 0 from TODO, validate() does not flip status (only updateProgress does)
    expect(result.status).toBe(TaskStatus.TODO);
  });

  it('uses provided startDate', async () => {
    const start = new Date();
    const deadline = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const result = await useCase.execute(
      baseDto({
        startDate: start.toISOString(),
        deadlineOrDueDate: deadline.toISOString(),
      }),
      'user-1',
    );
    expect(result.startDate.getTime()).toBe(start.getTime());
  });

  it('uses provided description', async () => {
    const result = await useCase.execute(
      baseDto({ description: 'details' }),
      'user-1',
    );
    expect(result.description).toBe('details');
  });
});
