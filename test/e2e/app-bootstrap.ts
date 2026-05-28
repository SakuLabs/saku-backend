import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../../src/app.module';
import {
  bootPostgres,
  teardownPostgres,
  IntegrationContext,
} from '../integration/postgres-container';

export interface E2EContext {
  app: INestApplication;
  prismaCtx: IntegrationContext;
  jwt: JwtService;
  signToken: (sub: string, email?: string) => string;
}

export const bootE2E = async (): Promise<E2EContext> => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret';
  process.env.DOCS_USER = process.env.DOCS_USER || 'admin';
  process.env.DOCS_PASS = process.env.DOCS_PASS || 'admin';

  const prismaCtx = await bootPostgres();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  const jwt = moduleRef.get(JwtService);

  return {
    app,
    prismaCtx,
    jwt,
    signToken: (sub, email = `${sub}@x.com`) => jwt.sign({ sub, email }),
  };
};

export const teardownE2E = async (ctx: E2EContext) => {
  await ctx.app.close();
  await teardownPostgres(ctx.prismaCtx);
};
