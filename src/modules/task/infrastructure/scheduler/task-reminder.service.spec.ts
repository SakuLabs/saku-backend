import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { TaskReminderService } from './task-reminder.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  createPrismaMock,
  MockPrisma,
} from '../../../../../test/utils/prisma-mock';

describe('TaskReminderService', () => {
  let service: TaskReminderService;
  let prisma: MockPrisma;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskReminderService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TaskReminderService);
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('marks past-deadline non-DONE/EXPIRED tasks as EXPIRED and logs count', async () => {
    prisma.task.updateMany.mockResolvedValueOnce({ count: 3 } as any);
    prisma.task.findMany.mockResolvedValueOnce([] as any);

    await service.handleDeadlineCheck();

    expect(prisma.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deadline: { lt: expect.any(Date) },
          status: { notIn: ['DONE', 'EXPIRED'] },
        }),
        data: { status: 'EXPIRED' },
      }),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
  });

  it('does not log when no tasks expired', async () => {
    prisma.task.updateMany.mockResolvedValueOnce({ count: 0 } as any);
    prisma.task.findMany.mockResolvedValueOnce([] as any);

    await service.handleDeadlineCheck();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('warns for each upcoming TODO task within next hour', async () => {
    prisma.task.updateMany.mockResolvedValueOnce({ count: 0 } as any);
    prisma.task.findMany.mockResolvedValueOnce([
      { title: 'Task A' },
      { title: 'Task B' },
    ] as any);

    await service.handleDeadlineCheck();

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Task A'),
    );
    expect(warnSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Task B'),
    );
  });

  it('queries upcoming within 1-hour window with TODO status', async () => {
    prisma.task.updateMany.mockResolvedValueOnce({ count: 0 } as any);
    prisma.task.findMany.mockResolvedValueOnce([] as any);

    await service.handleDeadlineCheck();

    const callArg = prisma.task.findMany.mock.calls[0][0] as {
      where: { deadline: { gt: Date; lt: Date }; status: string };
    };
    expect(callArg.where.status).toBe('TODO');
    const delta =
      callArg.where.deadline.lt.getTime() - callArg.where.deadline.gt.getTime();
    expect(delta).toBe(60 * 60 * 1000);
  });
});
