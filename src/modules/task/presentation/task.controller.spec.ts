import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TaskController } from './task.controller';
import { CreateTaskUseCase } from '../application/use-cases/create-task.use-case';
import type { ITaskRepository } from '../domain/task.repository.interface';
import { Task, TaskStatus } from '../domain/task.entity';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CreateTaskDto, TaskPriority } from './dto/create-task.dto';
import type { JwtPayload } from '../../../common/types/jwt-payload';

const me: JwtPayload = { sub: 'user-1', email: 'a@b.com' };

const buildTask = (overrides: Partial<Task> = {}): Task => {
  const t = new Task(
    'task-1',
    'Some title',
    '',
    new Date(),
    new Date(Date.now() + 24 * 60 * 60 * 1000),
    2,
    0,
    TaskStatus.TODO,
    new Date(),
  );
  Object.assign(t, overrides);
  return t;
};

describe('TaskController', () => {
  let controller: TaskController;
  let createTask: jest.Mocked<CreateTaskUseCase>;
  let repo: jest.Mocked<ITaskRepository>;

  beforeEach(async () => {
    createTask = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateTaskUseCase>;
    repo = {
      save: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<ITaskRepository>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskController],
      providers: [
        { provide: CreateTaskUseCase, useValue: createTask },
        { provide: 'ITaskRepository', useValue: repo },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(TaskController);
  });

  describe('getAll', () => {
    it('throws when no user', async () => {
      await expect(controller.getAll(null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('delegates to repo.findAll with userId', async () => {
      const tasks = [buildTask()];
      repo.findAll.mockResolvedValueOnce(tasks);
      const result = await controller.getAll(me);
      expect(repo.findAll).toHaveBeenCalledWith(me.sub);
      expect(result).toBe(tasks);
    });
  });

  describe('create', () => {
    const dto: CreateTaskDto = {
      title: 'New task',
      priority: TaskPriority.MEDIUM,
    };

    it('throws when no user', async () => {
      await expect(controller.create(dto, null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('delegates to use-case with dto + userId', async () => {
      const task = buildTask();
      createTask.execute.mockResolvedValueOnce(task);
      const result = await controller.create(dto, me);
      expect(createTask.execute).toHaveBeenCalledWith(dto, me.sub);
      expect(result).toBe(task);
    });
  });

  describe('updateStatus', () => {
    it('throws when no user', async () => {
      await expect(controller.updateStatus('id', 'DONE', null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when status empty', async () => {
      await expect(controller.updateStatus('id', '', me)).rejects.toThrow(
        /Status/,
      );
    });

    it('throws when task not found', async () => {
      repo.findById.mockResolvedValueOnce(null);
      await expect(controller.updateStatus('id', 'DONE', me)).rejects.toThrow(
        /ditemukan/,
      );
    });

    it('calls task.complete on DONE and saves', async () => {
      const task = buildTask();
      repo.findById.mockResolvedValueOnce(task);
      repo.save.mockResolvedValueOnce(task);
      await controller.updateStatus('id', 'DONE', me);
      expect(task.status).toBe(TaskStatus.DONE);
      expect(task.progress).toBe(100);
      expect(repo.save).toHaveBeenCalledWith(task, me.sub);
    });

    it('calls task.start on IN_PROGRESS and saves', async () => {
      const task = buildTask();
      repo.findById.mockResolvedValueOnce(task);
      repo.save.mockResolvedValueOnce(task);
      await controller.updateStatus('id', 'IN_PROGRESS', me);
      expect(task.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('calls task.reset on TODO and saves', async () => {
      const task = buildTask({ status: TaskStatus.IN_PROGRESS });
      repo.findById.mockResolvedValueOnce(task);
      repo.save.mockResolvedValueOnce(task);
      await controller.updateStatus('id', 'TODO', me);
      expect(task.status).toBe(TaskStatus.TODO);
      expect(repo.save).toHaveBeenCalledWith(task, me.sub);
    });

    it('throws on unknown status', async () => {
      const task = buildTask();
      repo.findById.mockResolvedValueOnce(task);
      await expect(
        controller.updateStatus('id', 'WHATEVER', me),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('wraps domain errors as BadRequest', async () => {
      const task = buildTask({ status: TaskStatus.DONE, progress: 100 });
      repo.findById.mockResolvedValueOnce(task);
      await expect(
        controller.updateStatus('id', 'IN_PROGRESS', me),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateProgress', () => {
    it('throws when no user', async () => {
      await expect(controller.updateProgress('id', 50, null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when progress not a number', async () => {
      await expect(
        controller.updateProgress('id', 'x' as unknown as number, me),
      ).rejects.toThrow(/angka/);
    });

    it('throws when task missing', async () => {
      repo.findById.mockResolvedValueOnce(null);
      await expect(controller.updateProgress('id', 50, me)).rejects.toThrow(
        /ditemukan/,
      );
    });

    it('updates progress and saves', async () => {
      const task = buildTask();
      repo.findById.mockResolvedValueOnce(task);
      repo.save.mockResolvedValueOnce(task);
      await controller.updateProgress('id', 75, me);
      expect(task.progress).toBe(75);
      expect(repo.save).toHaveBeenCalledWith(task, me.sub);
    });

    it('wraps domain errors as BadRequest', async () => {
      const task = buildTask();
      repo.findById.mockResolvedValueOnce(task);
      await expect(controller.updateProgress('id', 200, me)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('throws when no user', async () => {
      await expect(controller.remove('id', null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when task missing', async () => {
      repo.findById.mockResolvedValueOnce(null);
      await expect(controller.remove('id', me)).rejects.toThrow(/ditemukan/);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('deletes and returns message', async () => {
      repo.findById.mockResolvedValueOnce(buildTask());
      repo.delete.mockResolvedValueOnce(undefined);
      const result = await controller.remove('id-1', me);
      expect(repo.delete).toHaveBeenCalledWith('id-1');
      expect(result).toEqual({ message: 'Task deleted' });
    });
  });
});
