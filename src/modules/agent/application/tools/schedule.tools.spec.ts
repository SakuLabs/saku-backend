import { ForbiddenException } from '@nestjs/common';
import { ScheduleTools } from './schedule.tools';
import { CreateScheduleUseCase } from '../../../schedule/application/use-cases/create-schedule.use-case';
import type { IScheduleRepository } from '../../../schedule/domain/schedule.repository.interface';
import {
  Schedule,
  ScheduleColor,
  ScheduleImportance,
  ScheduleType,
} from '../../../schedule/domain/schedule.entity';

const makeSchedule = (userId = 'user-1', id = 'sch-1') =>
  new Schedule(
    id,
    'Math class',
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T11:00:00Z'),
    ScheduleType.EVENT,
    ScheduleColor.PURPLE,
    ScheduleImportance.NORMAL,
    0,
    'desc',
    userId,
  );

describe('ScheduleTools', () => {
  let tools: ScheduleTools;
  let createUseCase: { execute: jest.Mock };
  let repo: jest.Mocked<IScheduleRepository>;

  beforeEach(() => {
    createUseCase = { execute: jest.fn() };
    repo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findInTimeRange: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IScheduleRepository>;
    tools = new ScheduleTools(
      createUseCase as unknown as CreateScheduleUseCase,
      repo,
    );
  });

  it('exposes definitions for all five schedule tools', () => {
    const names = tools.definitions().map((d) => d.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'create_schedule',
        'list_schedules',
        'check_conflicts',
        'update_schedule',
        'delete_schedule',
      ]),
    );
  });

  it('create_schedule delegates to the use-case with userId', async () => {
    createUseCase.execute.mockResolvedValue(makeSchedule());
    const result = await tools.createSchedule(
      { title: 'Math class', startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T11:00:00Z' },
      { userId: 'user-1' },
    );
    expect(createUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Math class' }),
      'user-1',
    );
    expect((result as Schedule).title).toBe('Math class');
  });

  it('list_schedules with range uses findInTimeRange scoped to user', async () => {
    repo.findInTimeRange.mockResolvedValue([makeSchedule()]);
    await tools.listSchedules(
      { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' },
      { userId: 'user-1' },
    );
    expect(repo.findInTimeRange).toHaveBeenCalledWith(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      'user-1',
    );
  });

  it('list_schedules without range uses findByUserId', async () => {
    repo.findByUserId.mockResolvedValue([]);
    await tools.listSchedules({}, { userId: 'user-1' });
    expect(repo.findByUserId).toHaveBeenCalledWith('user-1');
  });

  it('check_conflicts returns hasConflict flag', async () => {
    repo.findInTimeRange.mockResolvedValue([makeSchedule()]);
    const result = (await tools.checkConflicts(
      { startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T11:00:00Z' },
      { userId: 'user-1' },
    )) as { hasConflict: boolean };
    expect(result.hasConflict).toBe(true);
  });

  it('update_schedule rejects when the schedule belongs to another user', async () => {
    repo.findById.mockResolvedValue(makeSchedule('other-user'));
    await expect(
      tools.updateSchedule({ id: 'sch-1', title: 'New title' }, { userId: 'user-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('update_schedule saves merged fields for the owner', async () => {
    repo.findById.mockResolvedValue(makeSchedule('user-1'));
    repo.save.mockImplementation((s) => Promise.resolve(s));
    const result = (await tools.updateSchedule(
      { id: 'sch-1', title: 'New title' },
      { userId: 'user-1' },
    )) as Schedule;
    expect(result.title).toBe('New title');
    expect(repo.save).toHaveBeenCalled();
  });

  it('delete_schedule rejects when not the owner', async () => {
    repo.findById.mockResolvedValue(makeSchedule('other-user'));
    await expect(
      tools.deleteSchedule({ id: 'sch-1' }, { userId: 'user-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('delete_schedule deletes for the owner', async () => {
    repo.findById.mockResolvedValue(makeSchedule('user-1'));
    const result = (await tools.deleteSchedule(
      { id: 'sch-1' },
      { userId: 'user-1' },
    )) as { deleted: boolean };
    expect(repo.delete).toHaveBeenCalledWith('sch-1');
    expect(result.deleted).toBe(true);
  });
});
