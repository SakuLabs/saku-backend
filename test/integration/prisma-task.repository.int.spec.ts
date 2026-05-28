import { PrismaTaskRepository } from '../../src/modules/task/infrastructure/persistence/prisma-task.repository';
import { Task, TaskStatus } from '../../src/modules/task/domain/task.entity';
import {
  bootPostgres,
  teardownPostgres,
  IntegrationContext,
} from './postgres-container';

describe('PrismaTaskRepository (integration)', () => {
  let ctx: IntegrationContext;
  let repo: PrismaTaskRepository;
  let userId: string;

  beforeAll(async () => {
    ctx = await bootPostgres();
    repo = new PrismaTaskRepository(ctx.prisma);
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownPostgres(ctx);
  }, 30_000);

  beforeEach(async () => {
    await ctx.prisma.task.deleteMany();
    await ctx.prisma.user.deleteMany();

    const u = await ctx.prisma.user.create({
      data: {
        email: `u-${Date.now()}@x.com`,
        password: 'x',
        name: 'Alice',
        userCode: `UC${Date.now()}`,
      },
    });
    userId = u.id;
  });

  const makeTask = (id: string) =>
    new Task(
      id,
      'A task title',
      'desc',
      new Date(),
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      2,
      0,
      TaskStatus.TODO,
      new Date(),
    );

  it('save creates a new row and returns the entity', async () => {
    const task = makeTask('task-int-1');
    const result = await repo.save(task, userId);

    expect(result).toBe(task);
    const row = await ctx.prisma.task.findUnique({ where: { id: task.id } });
    expect(row?.title).toBe('A task title');
    expect(row?.userId).toBe(userId);
  });

  it('save updates an existing row (upsert behaviour)', async () => {
    const task = makeTask('task-int-2');
    await repo.save(task, userId);

    task.title = 'Updated title';
    await repo.save(task, userId);

    const row = await ctx.prisma.task.findUnique({ where: { id: task.id } });
    expect(row?.title).toBe('Updated title');
  });

  it('findById hydrates a Task entity', async () => {
    const task = makeTask('task-int-3');
    await repo.save(task, userId);

    const found = await repo.findById(task.id);
    expect(found).toBeInstanceOf(Task);
    expect(found?.id).toBe(task.id);
    expect(found?.title).toBe('A task title');
    expect(found?.status).toBe(TaskStatus.TODO);
  });

  it('findById returns null when missing', async () => {
    expect(await repo.findById('does-not-exist')).toBeNull();
  });

  it('findAll filters by userId', async () => {
    await repo.save(makeTask('task-int-4'), userId);
    await repo.save(makeTask('task-int-5'), userId);

    const other = await ctx.prisma.user.create({
      data: {
        email: `o-${Date.now()}@x.com`,
        password: 'x',
        name: 'Bob',
        userCode: `OC${Date.now()}`,
      },
    });
    await repo.save(makeTask('task-int-6'), other.id);

    const mine = await repo.findAll(userId);
    expect(mine).toHaveLength(2);
    expect(mine.every((t) => t instanceof Task)).toBe(true);
  });

  it('findAll without userId returns all tasks', async () => {
    await repo.save(makeTask('task-int-7'), userId);
    const all = await repo.findAll();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it('delete removes the row', async () => {
    const task = makeTask('task-int-8');
    await repo.save(task, userId);
    await repo.delete(task.id);
    expect(await repo.findById(task.id)).toBeNull();
  });
});
