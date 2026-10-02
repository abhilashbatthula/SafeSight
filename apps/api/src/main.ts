import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  Module,
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Response } from 'express';
import { ApiController } from './controller';
import { startEngine } from './engine';
import { pool } from '../../../packages/db/src';
@Catch()
class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const message =
      error instanceof HttpException
        ? error.message
        : 'Internal error; check server logs';
    if (status === 500)
      console.error(
        error instanceof Error ? error.message : 'Unexpected error',
      );
    if (!res.headersSent)
      res.status(status).json({ error: { status, message } });
    else res.end();
  }
}
@Module({ controllers: [ApiController] })
class AppModule {}
async function main() {
  if (!process.env.DATABASE_URL || !process.env.INFERENCE_KEY)
    throw new Error(
      'DATABASE_URL and INFERENCE_KEY are required; run pnpm setup:dev',
    );
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.APP_MODE === 'development'
  )
    throw new Error('Production cannot use APP_MODE=development');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.useGlobalFilters(new SafeErrors());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('SafeSight REST API')
      .setDescription(
        'v1. HttpOnly cookie sessions; all mutations require same Origin and X-CSRF-Token from /auth/me. Environmental readings are simulated.',
      )
      .setVersion('1.0.0')
      .addCookieAuth('safesight_session')
      .build(),
  );
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
  });
  const stop = await startEngine();
  await app.listen(
    Number(process.env.API_PORT || 4000),
    process.env.API_HOST || '127.0.0.1',
  );
  const shutdown = async () => {
    await stop();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Startup failed');
  process.exit(1);
});
