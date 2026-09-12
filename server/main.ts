import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import 'dotenv/config';
import type { NextFunction, Request, Response } from 'express';
import { json } from 'express';
import helmet from 'helmet';
import { resolve } from 'node:path';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './filters/api-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'script-src': ["'self'"],
          'connect-src': ["'self'"],
          'font-src': ["'self'"],
        },
      },
    }),
  );
  app.use(json({ limit: '2mb' }));
  const origin = process.env['APP_ORIGIN'] ?? 'http://127.0.0.1:5173';
  app.enableCors({ origin, credentials: true });
  app.use((request: Request, response: Response, next: NextFunction): void => {
    response.setHeader('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers.origin &&
      request.headers.origin !== origin
    ) {
      response.status(403).json({ message: 'Origin is not allowed.' });

      return;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !request.is('application/json')) {
      response.status(415).json({ message: 'JSON content type is required.' });

      return;
    }
    next();
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  if (process.env['NODE_ENV'] === 'production') {
    app.useStaticAssets(resolve('dist'));
  }
  await app.listen(Number(process.env['PORT'] ?? 3001), '127.0.0.1');
}
void bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Startup failed');
  process.exitCode = 1;
});
