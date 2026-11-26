import 'reflect-metadata';
import { INestApplication, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { CreateAppOptions, resolveOptions } from './app.options';

export { APP_OPTIONS } from './app.options';
export type { CreateAppOptions, MailMode, ResolvedAppOptions } from './app.options';

/** Тестовый хук и точка сборки приложения (docs/specs/system/api.md, раздел 6.1). */
export async function createApp(options: CreateAppOptions): Promise<INestApplication> {
  const logger: LogLevel[] = process.env.NODE_ENV === 'test' ? ['error'] : ['log', 'error', 'warn'];
  const resolved = resolveOptions(options);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(resolved), { logger });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  if (resolved.staticDir) {
    const root = resolve(resolved.staticDir);
    app.useStaticAssets(root, { index: false });
    // SPA-fallback: любой GET не на /api, не найденный как файл, отдаёт index.html.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path === '/api' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(resolve(root, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  }
  await app.init();
  return app;
}
