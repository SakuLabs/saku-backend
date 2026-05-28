import { Test, TestingModule } from '@nestjs/testing';
import { PrismaTaskRepository } from './prisma-task.repository';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Task, TaskStatus } from '../../domain/task.entity';
import {
  createPrismaMock,
  MockPrisma,
} from '../../../../../test/utils/prisma-mock';

const makeRow = (overrides = {}) => ({
  id: 'task-1',
  title: 'Some title',
  description: 'desc',
  startDate: new Date(),
  deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
  priority: 2,
  progress: 0,
  status: 'TODO',
  createdAt: new Date(),
  userId: 'user-1',
  groupId: null,
  ...overrides,
});

describe('PrismaTaskRepository', () => {
  let repo: PrismaTaskRepository;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaTaskRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    repo = module.get(PrismaTaskRepository);
  });

  describe('save', () => {
    const task = new Task(
      'task-1',
      'Some title',
      'desc',
      new Date(),
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      2,
      0,
      TaskStatus.TODO,
      new Date(),
    );

    it('upserts with userId when provided and returns the task', async () => {
      prisma.task.upsert.mockResolvedValueOnce({} as any);
      const result = await repo.save(task, 'user-1');

      expect(prisma.task.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: task.id },
          update: expect.objectContaining({ userId: 'user-1' }),
          create: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
      expect(result).toBe(task);
    });

    it('upserts with undefined userId when not provided', async () => {
      prisma.task.upsert.mockResolvedValueOnce({} as any);
      await repo.save(task);
      const arg = prisma.task.upsert.mock.calls[0][0] as any;
      expect(arg.update.userId).toBeUndefined();
      expect(arg.create.userId).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('returns null when not found', async () => {
      prisma.task.findUnique.mockResolvedValueOnce(null);
      expect(await repo.findById('nope')).toBeNull();
    });

    it('hydrates a Task entity from db row', async () => {
      const row = makeRow();
      prisma.task.findUnique.mockResolvedValueOnce(row as any);

      const result = await repo.findById(row.id);

      expect(result).toBeInstanceOf(Task);
      expect(result?.id).toBe(row.id);
      expect(result?.title).toBe(row.title);
      expect(result?.status).toBe(TaskStatus.TODO);
    });
  });

  describe('findAll', () => {
    it('passes userId to where when provided', async () => {
      prisma.task.findMany.mockResolvedValueOnce([] as any);
      await repo.findAll('user-1');
      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('uses empty where when no userId', async () => {
      prisma.task.findMany.mockResolvedValueOnce([] as any);
      await repo.findAll();
      expect(prisma.task.findMany).toHaveBeenCalledWith({ where: {} });
    });

    it('maps rows into Task entities', async () => {
      prisma.task.findMany.mockResolvedValueOnce([
        makeRow(),
        makeRow({ id: 't2' }),
      ] as any);
      const result = await repo.findAll('user-1');
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Task);
      expect(result[1]?.id).toBe('t2');
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      prisma.task.delete.mockResolvedValueOnce({} as any);
      await repo.delete('task-1');
      expect(prisma.task.delete).toHaveBeenCalledWith({
        where: { id: 'task-1' },
      });
    });
  });
});
