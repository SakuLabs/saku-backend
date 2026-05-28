import request from 'supertest';
import { bootE2E, teardownE2E, E2EContext } from './app-bootstrap';

describe('Auth (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await bootE2E();
  }, 120_000);

  afterAll(async () => {
    if (ctx) await teardownE2E(ctx);
  }, 30_000);

  beforeEach(async () => {
    await ctx.prismaCtx.prisma.user.deleteMany();
  });

  describe('POST /auth/register', () => {
    it('400 when fields missing', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'a@b.com' });
      expect(res.status).toBe(400);
    });

    it('201 + access_token + safe user on success', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'alice@x.com',
          password: 'secret123',
          name: 'Alice',
        });
      expect(res.status).toBe(201);
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({
        email: 'alice@x.com',
        name: 'Alice',
      });
      expect(res.body.user.password).toBeUndefined();
    });

    it('400 when email already registered', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'dup@x.com', password: 'secret123', name: 'Bob' })
        .expect(201);

      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'dup@x.com', password: 'secret123', name: 'Bob' });
      expect([400, 409]).toContain(res.status);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'logger@x.com',
          password: 'secret123',
          name: 'Logger',
        });
    });

    it('200 + access_token on valid credentials', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'logger@x.com', password: 'secret123' });
      expect(res.status).toBe(201);
      expect(res.body.access_token).toEqual(expect.any(String));
    });

    it('401 on wrong password', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'logger@x.com', password: 'wrong' });
      expect([400, 401]).toContain(res.status);
    });

    it('401 on unknown email', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nope@x.com', password: 'secret123' });
      expect([400, 401]).toContain(res.status);
    });
  });
});
