import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { CreateScheduleUseCase } from '../application/use-cases/create-schedule.use-case';
import type { IScheduleRepository } from '../domain/schedule.repository.interface';
import {
  Schedule,
  ScheduleColor,
  ScheduleImportance,
  ScheduleType,
} from '../domain/schedule.entity';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  createPrismaMock,
  MockPrisma,
} from '../../../../test/utils/prisma-mock';
import type { JwtPayload } from '../../../common/types/jwt-payload';

const me: JwtPayload = { sub: 'user-1', email: 'a@b.com' };

const buildSchedule = (
  overrides: Partial<{
    id: string;
    userId?: string;
    groupId?: string;
    progress: number;
  }> = {},
) =>
  new Schedule(
    overrides.id ?? 'sch-1',
    'Math class',
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T11:00:00Z'),
    ScheduleType.EVENT,
    ScheduleColor.PURPLE,
    ScheduleImportance.NORMAL,
    overrides.progress ?? 0,
    'desc',
    overrides.userId ?? me.sub,
    overrides.groupId,
  );

describe('ScheduleController', () => {
  let controller: ScheduleController;
  let createSchedule: jest.Mocked<CreateScheduleUseCase>;
  let scheduleRepo: jest.Mocked<IScheduleRepository>;
  let prisma: MockPrisma;

  beforeEach(async () => {
    createSchedule = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateScheduleUseCase>;
    scheduleRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findInTimeRange: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IScheduleRepository>;
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleController],
      providers: [
        { provide: CreateScheduleUseCase, useValue: createSchedule },
        { provide: 'IScheduleRepository', useValue: scheduleRepo },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ScheduleController);
  });

  describe('getAll', () => {
    it('throws when no user', async () => {
      await expect(controller.getAll(null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('delegates to repo.findByUserId', async () => {
      const list = [buildSchedule()];
      scheduleRepo.findByUserId.mockResolvedValueOnce(list);
      const result = await controller.getAll(me);
      expect(scheduleRepo.findByUserId).toHaveBeenCalledWith(me.sub);
      expect(result).toBe(list);
    });
  });

  describe('checkConflicts', () => {
    it('throws when no user', async () => {
      await expect(controller.checkConflicts('s', 'e', null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when startTime/endTime missing', async () => {
      await expect(controller.checkConflicts('', '', me)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns hasConflict=false when no conflicts', async () => {
      scheduleRepo.findInTimeRange.mockResolvedValueOnce([]);
      const result = await controller.checkConflicts(
        '2026-01-01T10:00:00Z',
        '2026-01-01T11:00:00Z',
        me,
      );
      expect(result).toEqual({ hasConflict: false, conflicts: [] });
    });

    it('returns conflicts when overlapping', async () => {
      const list = [buildSchedule()];
      scheduleRepo.findInTimeRange.mockResolvedValueOnce(list);
      const result = await controller.checkConflicts(
        '2026-01-01T10:00:00Z',
        '2026-01-01T11:00:00Z',
        me,
      );
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts).toBe(list);
    });
  });

  describe('create', () => {
    const dto = {
      title: 'Math',
      startTime: '2026-01-01T10:00:00Z',
      endTime: '2026-01-01T11:00:00Z',
    } as any;

    it('throws when no user', async () => {
      await expect(controller.create(dto, null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates personal schedule', async () => {
      const s = buildSchedule();
      createSchedule.execute.mockResolvedValueOnce(s);
      const result = await controller.create(dto, me);
      expect(createSchedule.execute).toHaveBeenCalledWith(dto, me.sub);
      expect(result).toBe(s);
    });

    it('rejects when group membership missing', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce(null);
      await expect(
        controller.create({ ...dto, groupId: 'g1' }, me),
      ).rejects.toThrow(/anggota/);
      expect(createSchedule.execute).not.toHaveBeenCalled();
    });

    it('rejects when member lacks create permission', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'MEMBER',
        canCreateSchedule: false,
      } as any);
      await expect(
        controller.create({ ...dto, groupId: 'g1' }, me),
      ).rejects.toThrow(/akses/);
    });

    it('allows ADMIN even without canCreateSchedule flag', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'ADMIN',
        canCreateSchedule: false,
      } as any);
      const s = buildSchedule({ groupId: 'g1' });
      createSchedule.execute.mockResolvedValueOnce(s);
      const result = await controller.create({ ...dto, groupId: 'g1' }, me);
      expect(result).toBe(s);
    });

    it('links taskIds to schedule when provided', async () => {
      const s = buildSchedule();
      createSchedule.execute.mockResolvedValueOnce(s);
      prisma.task.updateMany.mockResolvedValueOnce({ count: 2 } as any);

      await controller.create({ ...dto, taskIds: ['t1', 't2'] }, me);

      expect(prisma.task.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1', 't2'] }, userId: me.sub },
        data: { scheduleId: s.id },
      });
    });

    it('does not call updateMany when taskIds empty', async () => {
      const s = buildSchedule();
      createSchedule.execute.mockResolvedValueOnce(s);
      await controller.create({ ...dto, taskIds: [] }, me);
      expect(prisma.task.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws when no user', async () => {
      await expect(controller.update('id', {} as any, null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when schedule not found', async () => {
      scheduleRepo.findById.mockResolvedValueOnce(null);
      await expect(controller.update('id', {} as any, me)).rejects.toThrow(
        /ditemukan/,
      );
    });

    it('rejects when not owner and no group access', async () => {
      const s = buildSchedule({ userId: 'other', groupId: 'g1' });
      scheduleRepo.findById.mockResolvedValueOnce(s);
      prisma.groupMember.findFirst.mockResolvedValueOnce(null);
      await expect(controller.update('id', {} as any, me)).rejects.toThrow(
        /akses/,
      );
    });

    it('allows owner to update', async () => {
      const s = buildSchedule();
      scheduleRepo.findById.mockResolvedValueOnce(s);
      scheduleRepo.save.mockImplementation((sch) => Promise.resolve(sch));

      const result = await controller.update(
        'id',
        { title: 'New title' } as any,
        me,
      );

      expect(scheduleRepo.save).toHaveBeenCalled();
      expect((result as Schedule).title).toBe('New title');
    });

    it('deletes when progress >= 100 instead of saving', async () => {
      const s = buildSchedule();
      scheduleRepo.findById.mockResolvedValueOnce(s);

      const result = await controller.update(
        'id',
        { progress: 100 } as any,
        me,
      );

      expect(scheduleRepo.delete).toHaveBeenCalledWith(s.id);
      expect(scheduleRepo.save).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });

    it('reassigns linked tasks: clears removed, attaches new', async () => {
      const s = buildSchedule();
      scheduleRepo.findById.mockResolvedValueOnce(s);
      scheduleRepo.save.mockImplementation((sch) => Promise.resolve(sch));
      prisma.task.updateMany.mockResolvedValue({ count: 1 } as any);

      await controller.update('id', { taskIds: ['t1'] } as any, me);

      expect(prisma.task.updateMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            scheduleId: s.id,
            userId: me.sub,
            id: { notIn: ['t1'] },
          }),
          data: { scheduleId: null },
        }),
      );
      expect(prisma.task.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: { in: ['t1'] }, userId: me.sub },
          data: { scheduleId: s.id },
        }),
      );
    });

    it('clears all linked tasks when taskIds=[]', async () => {
      const s = buildSchedule();
      scheduleRepo.findById.mockResolvedValueOnce(s);
      scheduleRepo.save.mockImplementation((sch) => Promise.resolve(sch));
      prisma.task.updateMany.mockResolvedValue({ count: 1 } as any);

      await controller.update('id', { taskIds: [] } as any, me);

      expect(prisma.task.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.task.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ id: expect.anything() }),
          data: { scheduleId: null },
        }),
      );
    });
  });

  describe('delete', () => {
    it('throws when no user', async () => {
      await expect(controller.delete('id', null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when not found', async () => {
      scheduleRepo.findById.mockResolvedValueOnce(null);
      await expect(controller.delete('id', me)).rejects.toThrow(/ditemukan/);
    });

    it('throws when not owner', async () => {
      scheduleRepo.findById.mockResolvedValueOnce(
        buildSchedule({ userId: 'other' }),
      );
      await expect(controller.delete('id', me)).rejects.toThrow(/akses/);
      expect(scheduleRepo.delete).not.toHaveBeenCalled();
    });

    it('deletes when owner', async () => {
      scheduleRepo.findById.mockResolvedValueOnce(buildSchedule());
      const result = await controller.delete('id', me);
      expect(scheduleRepo.delete).toHaveBeenCalledWith('id');
      expect(result).toEqual({ message: 'Schedule deleted successfully' });
    });
  });
});
