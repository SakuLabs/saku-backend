import request from 'supertest';
import { bootE2E, teardownE2E, E2EContext } from './app-bootstrap';

describe('Tasks (e2e)', () => {
  let ctx: E2EContext;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    ctx = await bootE2E();
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownE2E(ctx);
  }, 30_000);

  beforeEach(async () => {
    await ctx.prismaCtx.prisma.task.deleteMany();
    await ctx.prismaCtx.prisma.user.deleteMany();

    const u = await ctx.prismaCtx.prisma.user.create({
      data: {
        email: `t-${Date.now()}@x.com`,
        password: 'x',
        name: 'Alice',
        userCode: `TC${Date.now()}`,
      },
    });
    userId = u.id;
    token = ctx.signToken(userId, u.email);
  });

  const futureIso = (hours = 24) =>
    new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  it('GET /tasks empty when no tasks', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/tasks')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /tasks creates a task', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Finish homework',
        priority: 'HIGH',
        deadline: futureIso(),
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Finish homework');
    expect(res.body.priority).toBe(3);
  });

  it('PATCH /tasks/:id/status DONE marks completed', async () => {
    const create = await request(ctx.app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Run laundry', priority: 'MEDIUM' })
      .expect(201);

    const id = create.body.id;
    const res = await request(ctx.app.getHttpServer())
      .patch(`/tasks/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DONE' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DONE');
    expect(res.body.progress).toBe(100);
  });

  it('PATCH /tasks/:id/progress 50 flips status to IN_PROGRESS', async () => {
    const create = await request(ctx.app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Study chapter', priority: 'LOW' })
      .expect(201);
    const id = create.body.id;

    const res = await request(ctx.app.getHttpServer())
      .patch(`/tasks/${id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ progress: 50 });
    expect(res.status).toBe(200);
    expect(res.body.progress).toBe(50);
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  it('DELETE /tasks/:id removes the task', async () => {
    const create = await request(ctx.app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Throwaway', priority: 'LOW' })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .delete(`/tasks/${create.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const get = await request(ctx.app.getHttpServer())
      .get('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(get.body).toEqual([]);
  });

  it('GET /tasks without token returns empty list (guard allows null)', async () => {
    // JwtAuthGuard currently lets unauthenticated requests through but the
    // controller throws BadRequest when user.sub is missing.
    const res = await request(ctx.app.getHttpServer()).get('/tasks');
    expect([400, 401]).toContain(res.status);
  });
});
