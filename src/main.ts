import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

function docsBasicAuth(req: Request, res: Response, next: NextFunction) {
  const expectedUser = process.env.DOCS_USER;
  const expectedPass = process.env.DOCS_PASS;

  if (!expectedUser || !expectedPass) {
    res.status(503).send('Docs auth not configured');
    return;
  }

  const header = req.headers.authorization ?? '';
  const [scheme, encoded] = header.split(' ');

  if (scheme !== 'Basic' || !encoded) {
    res
      .set('WWW-Authenticate', 'Basic realm="docs"')
      .status(401)
      .send('Auth required');
    return;
  }

  const [user, pass] = Buffer.from(encoded, 'base64')
    .toString('utf8')
    .split(':');
  const userBuf = Buffer.from(user ?? '');
  const passBuf = Buffer.from(pass ?? '');
  const expUserBuf = Buffer.from(expectedUser);
  const expPassBuf = Buffer.from(expectedPass);

  const userOk =
    userBuf.length === expUserBuf.length &&
    timingSafeEqual(userBuf, expUserBuf);
  const passOk =
    passBuf.length === expPassBuf.length &&
    timingSafeEqual(passBuf, expPassBuf);

  if (!userOk || !passOk) {
    res
      .set('WWW-Authenticate', 'Basic realm="docs"')
      .status(401)
      .send('Invalid credentials');
    return;
  }

  next();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Vite default port
    credentials: true,
  });

  // Enable validation pipes globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // OpenAPI spec
  const config = new DocumentBuilder()
    .setTitle('Campus Scheduler API')
    .setDescription('API documentation for Campus Scheduler application')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Scalar API reference (basic-auth gated, available in all envs)
  app.use('/docs/json', docsBasicAuth, (_req: Request, res: Response) =>
    res.json(document),
  );
  app.use(
    '/docs',
    docsBasicAuth,
    apiReference({
      content: document,
      theme: 'purple',
    }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API reference available at: http://localhost:${port}/docs`);
  console.log(`📄 OpenAPI JSON at: http://localhost:${port}/docs/json`);
}
bootstrap();
