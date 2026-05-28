import { execSync } from 'child_process';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface IntegrationContext {
  container: StartedPostgreSqlContainer;
  prisma: PrismaService;
  url: string;
}

export const bootPostgres = async (): Promise<IntegrationContext> => {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('saku_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;

  // Apply schema via prisma migrate deploy
  execSync('bunx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const prisma = new PrismaService();
  await prisma.onModuleInit();
  return { container, prisma, url };
};

export const teardownPostgres = async (ctx: IntegrationContext) => {
  // Swallow pg pool errors fired during teardown when container stops
  const onErr = () => undefined;
  process.on('uncaughtException', onErr);
  process.on('unhandledRejection', onErr);

  try {
    await ctx.prisma.onModuleDestroy();
  } catch {
    // ignore
  }
  await ctx.container.stop();

  // Give the pool a tick to settle
  await new Promise((r) => setTimeout(r, 50));
  process.off('uncaughtException', onErr);
  process.off('unhandledRejection', onErr);
};
