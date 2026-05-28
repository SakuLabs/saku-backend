import { PrismaScheduleRepository } from '../../src/modules/schedule/infrastructure/persistence/prisma-schedule.repository';
import {
  Schedule,
  ScheduleColor,
  ScheduleImportance,
  ScheduleType,
} from '../../src/modules/schedule/domain/schedule.entity';
import {
  bootPostgres,
  teardownPostgres,
  IntegrationContext,
} from './postgres-container';

describe('PrismaScheduleRepository (integration)', () => {
  let ctx: IntegrationContext;
  let repo: PrismaScheduleRepository;
  let userId: string;
  let groupId: string;

  beforeAll(async () => {
    ctx = await bootPostgres();
    repo = new PrismaScheduleRepository(ctx.prisma);
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownPostgres(ctx);
  }, 30_000);

  beforeEach(async () => {
    await ctx.prisma.schedule.deleteMany();
    await ctx.prisma.groupMember.deleteMany();
    await ctx.prisma.group.deleteMany();
    await ctx.prisma.user.deleteMany();

    const u = await ctx.prisma.user.create({
      data: {
        email: `u-${Date.now()}@x.com`,
        password: 'x',
        name: 'Alice',
        userCode: `SU${Date.now()}`,
      },
    });
    userId = u.id;

    const g = await ctx.prisma.group.create({ data: { name: 'Squad' } });
    groupId = g.id;
    await ctx.prisma.groupMember.create({
      data: { groupId, userId, role: 'MEMBER', canCreateSchedule: true },
    });
  });

  const makeSchedule = (id: string, opts: Partial<{ groupId: string }> = {}) =>
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
      opts.groupId,
    );

  it('save upserts and returns hydrated entity', async () => {
    const s = makeSchedule('sch-int-1');
    const saved = await repo.save(s);
    expect(saved).toBeInstanceOf(Schedule);
    expect(saved.userId).toBe(userId);
  });

  it('findByUserId returns personal + group schedules', async () => {
    await repo.save(makeSchedule('sch-int-2'));
    await repo.save(makeSchedule('sch-int-3', { groupId }));

    const list = await repo.findByUserId(userId);
    expect(list.length).toBe(2);
  });

  it('findInTimeRange returns overlapping schedules', async () => {
    await repo.save(makeSchedule('sch-int-4'));
    const list = await repo.findInTimeRange(
      new Date('2026-01-01T09:00:00Z'),
      new Date('2026-01-01T12:00:00Z'),
      userId,
    );
    expect(list.length).toBe(1);
  });

  it('findInTimeRange excludes non-overlapping schedules', async () => {
    await repo.save(makeSchedule('sch-int-5'));
    const list = await repo.findInTimeRange(
      new Date('2026-02-01T10:00:00Z'),
      new Date('2026-02-01T11:00:00Z'),
      userId,
    );
    expect(list.length).toBe(0);
  });

  it('delete removes the row', async () => {
    const s = makeSchedule('sch-int-6');
    await repo.save(s);
    await repo.delete(s.id);
    expect(await repo.findById(s.id)).toBeNull();
  });

  it('rejects entity without userId', async () => {
    const orphan = new Schedule(
      'sch-int-7',
      'Orphan',
      new Date('2026-01-01T10:00:00Z'),
      new Date('2026-01-01T11:00:00Z'),
      ScheduleType.EVENT,
      ScheduleColor.PURPLE,
      ScheduleImportance.NORMAL,
      0,
      undefined,
      undefined,
      undefined,
    );
    await expect(repo.save(orphan)).rejects.toThrow(/userId/);
  });
});
