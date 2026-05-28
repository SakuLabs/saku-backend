import { Test, TestingModule } from '@nestjs/testing';
import { PrismaScheduleRepository } from './prisma-schedule.repository';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  Schedule,
  ScheduleColor,
  ScheduleImportance,
  ScheduleType,
} from '../../domain/schedule.entity';
import {
  createPrismaMock,
  MockPrisma,
} from '../../../../../test/utils/prisma-mock';

const makeRow = (overrides = {}) => ({
  id: 'sch-1',
  title: 'Math class',
  description: 'desc',
  startTime: new Date('2026-01-01T10:00:00Z'),
  endTime: new Date('2026-01-01T11:00:00Z'),
  type: 'EVENT',
  color: 'purple',
  importance: 'NORMAL',
  progress: 0,
  userId: 'user-1',
  groupId: null,
  ...overrides,
});

const buildEntity = (
  overrides: Partial<{ id: string; userId?: string; groupId?: string }> = {},
) =>
  new Schedule(
    overrides.id ?? 'sch-1',
    'Math class',
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T11:00:00Z'),
    ScheduleType.EVENT,
    ScheduleColor.PURPLE,
    ScheduleImportance.NORMAL,
    0,
    'desc',
    overrides.userId ?? 'user-1',
    overrides.groupId,
  );

describe('PrismaScheduleRepository', () => {
  let repo: PrismaScheduleRepository;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaScheduleRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    repo = module.get(PrismaScheduleRepository);
  });

  describe('save', () => {
    it('throws when entity has no userId', async () => {
      const orphan = new Schedule(
        'sch-1',
        'Math class',
        new Date('2026-01-01T10:00:00Z'),
        new Date('2026-01-01T11:00:00Z'),
        ScheduleType.EVENT,
        ScheduleColor.PURPLE,
        ScheduleImportance.NORMAL,
        0,
        'desc',
        undefined,
        undefined,
      );
      await expect(repo.save(orphan)).rejects.toThrow(/userId/);
    });

    it('upserts and returns hydrated domain entity', async () => {
      prisma.schedule.upsert.mockResolvedValueOnce(makeRow() as any);
      const entity = buildEntity();
      const result = await repo.save(entity);

      expect(prisma.schedule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: entity.id },
          update: expect.objectContaining({ userId: 'user-1' }),
          create: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
      expect(result).toBeInstanceOf(Schedule);
      expect(result.id).toBe('sch-1');
    });
  });

  describe('findById', () => {
    it('returns null when missing', async () => {
      prisma.schedule.findUnique.mockResolvedValueOnce(null);
      expect(await repo.findById('nope')).toBeNull();
    });

    it('hydrates entity when found', async () => {
      prisma.schedule.findUnique.mockResolvedValueOnce(makeRow() as any);
      const result = await repo.findById('sch-1');
      expect(result).toBeInstanceOf(Schedule);
      expect(result?.title).toBe('Math class');
    });
  });

  describe('findByUserId', () => {
    it('queries OR(userId | groupId IN memberships) and orders by startTime', async () => {
      prisma.groupMember.findMany.mockResolvedValueOnce([
        { groupId: 'g1' },
        { groupId: 'g2' },
      ] as any);
      prisma.schedule.findMany.mockResolvedValueOnce([makeRow()] as any);

      await repo.findByUserId('user-1');

      expect(prisma.schedule.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ userId: 'user-1' }, { groupId: { in: ['g1', 'g2'] } }],
        },
        orderBy: { startTime: 'asc' },
      });
    });

    it('omits groupId filter when no memberships', async () => {
      prisma.groupMember.findMany.mockResolvedValueOnce([] as any);
      prisma.schedule.findMany.mockResolvedValueOnce([] as any);

      await repo.findByUserId('user-1');

      expect(prisma.schedule.findMany).toHaveBeenCalledWith({
        where: { OR: [{ userId: 'user-1' }] },
        orderBy: { startTime: 'asc' },
      });
    });
  });

  describe('findInTimeRange', () => {
    it('queries for overlap within window', async () => {
      prisma.schedule.findMany.mockResolvedValueOnce([makeRow()] as any);
      const start = new Date('2026-01-01T09:00:00Z');
      const end = new Date('2026-01-01T12:00:00Z');

      await repo.findInTimeRange(start, end, 'user-1');

      expect(prisma.schedule.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ startTime: { lte: end }, endTime: { gte: start } }],
          userId: 'user-1',
        },
        orderBy: { startTime: 'asc' },
      });
    });

    it('omits userId filter when not supplied', async () => {
      prisma.schedule.findMany.mockResolvedValueOnce([] as any);
      await repo.findInTimeRange(new Date(), new Date());
      const arg = prisma.schedule.findMany.mock.calls[0][0] as any;
      expect(arg.where.userId).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      prisma.schedule.delete.mockResolvedValueOnce({} as any);
      await repo.delete('sch-1');
      expect(prisma.schedule.delete).toHaveBeenCalledWith({
        where: { id: 'sch-1' },
      });
    });
  });
});
