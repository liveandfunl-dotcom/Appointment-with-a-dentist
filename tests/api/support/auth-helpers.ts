// Вспомогательные функции для tests/api/auth.spec.ts (AC-AUTH-01…13).
// Контракт: docs/specs/system/api.md (разделы 3, 4.2–4.6, 4.10, 6), docs/specs/design/data-model.md (раздел 4).
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../../../backend/src/app.factory';
import { MailService, type MailMessage } from '../../../backend/src/mail/mail.service';

export const APP_URL = 'http://clinic.test:8080';

/** Начальное время тестовых часов (четверг, 10:00 по Афинам). */
export const START_TIME = new Date('2026-11-26T08:00:00.000Z');

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

/** Max-Age cookie сессии: 30 дней в секундах (api.md 4.3). */
export const SESSION_MAX_AGE = 2592000;

export const ROOT = { login: 'root', password: 'root1234', email: 'root@clinic.local' } as const;
export const ADMIN = { login: 'admin', password: 'admin1234', email: 'admin@clinic.local' } as const;
export const DOCTOR1 = {
  login: 'doctor1',
  password: 'doctor1234',
  email: 'doctor1@clinic.local',
  surname: 'Иванов',
  name: 'Иван',
} as const;
export const DOCTOR2 = { login: 'doctor2', password: 'doctor1234', email: 'doctor2@clinic.local' } as const;

/** Управляемые часы: тест сдвигает время между запросами. */
export class TestClock {
  private current: Date;

  constructor(start: Date = START_TIME) {
    this.current = new Date(start.getTime());
  }

  readonly now = (): Date => new Date(this.current.getTime());

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }
}

export interface TestContext {
  app: INestApplication;
  clock: TestClock;
  outbox: MailMessage[];
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/** Поднимает приложение на временной БД с dev-сидом, mail: 'memory' и управляемыми часами. */
export async function startApp(): Promise<TestContext> {
  const dir = mkdtempSync(join(tmpdir(), 'clinic-auth-'));
  const clock = new TestClock();
  let app: INestApplication | undefined;
  try {
    app = await createApp({
      dbPath: join(dir, 'test.db'),
      mail: 'memory',
      seedDev: true,
      appUrl: APP_URL,
      now: clock.now,
    });
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  const started = app;
  return {
    app: started,
    clock,
    outbox: started.get(MailService).outbox,
    http: () => request(started.getHttpServer()),
    close: async () => {
      await started.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Все заголовки Set-Cookie ответа. */
export function setCookies(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as unknown;
  if (raw === undefined) return [];
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}

/** Заголовок Set-Cookie для cookie `session` или undefined. */
export function sessionSetCookie(res: request.Response): string | undefined {
  return setCookies(res).find((c) => c.startsWith('session='));
}

/** Значение для заголовка `Cookie` (`session=<token>`) из ответа verify/login. */
export function sessionCookie(res: request.Response): string {
  const header = sessionSetCookie(res);
  if (!header) {
    throw new Error(`Ответ ${res.status} без Set-Cookie session: ${JSON.stringify(res.body)}`);
  }
  return header.split(';')[0];
}

/** Атрибуты Set-Cookie в виде словаря с ключами в нижнем регистре (`max-age`, `httponly`, …). */
export function cookieAttributes(header: string): Record<string, string> {
  const [, ...parts] = header.split(';').map((p) => p.trim());
  const attrs: Record<string, string> = {};
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = (eq === -1 ? part : part.slice(0, eq)).toLowerCase();
    attrs[key] = eq === -1 ? '' : part.slice(eq + 1);
  }
  return attrs;
}

/** Извлекает токен из ссылки `${APP_URL}/auth/magic?token=…` в тексте письма. */
export function extractMagicToken(text: string, appUrl: string = APP_URL): string {
  const escaped = appUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}/auth/magic\\?token=([A-Za-z0-9_-]+)`).exec(text);
  if (!match) throw new Error(`В письме нет ссылки ${appUrl}/auth/magic?token=…: ${text}`);
  return match[1];
}

export function requestMagicLink(ctx: TestContext, email: unknown, lang?: string) {
  const body: Record<string, unknown> = { email };
  if (lang !== undefined) body.lang = lang;
  return ctx.http().post('/api/auth/magic-link').send(body);
}

export function verifyToken(ctx: TestContext, token: unknown) {
  return ctx.http().post('/api/auth/magic-link/verify').send({ token });
}

export function login(ctx: TestContext, loginValue: unknown, password: unknown) {
  return ctx.http().post('/api/auth/login').send({ login: loginValue, password });
}

export function me(ctx: TestContext, cookie?: string) {
  const req = ctx.http().get('/api/auth/me');
  return cookie ? req.set('Cookie', cookie) : req;
}

/** Запрашивает magic link и возвращает токен из последнего письма на `email`. */
export async function magicToken(ctx: TestContext, email: string, lang?: string): Promise<string> {
  const res = await requestMagicLink(ctx, email, lang);
  if (res.status !== 200) {
    throw new Error(`magic-link ${email} → ${res.status} ${JSON.stringify(res.body)}`);
  }
  const letters = ctx.outbox.filter((m) => m.to === email);
  if (letters.length === 0) throw new Error(`Нет письма на ${email}`);
  return extractMagicToken(letters[letters.length - 1].text);
}

/** Входит по логину и паролю; возвращает cookie и AuthUser. */
export async function loginAs(
  ctx: TestContext,
  loginValue: string,
  password: string,
): Promise<{ cookie: string; user: { id: number; surname: string; name: string; role: string } }> {
  const res = await login(ctx, loginValue, password);
  if (res.status !== 200) {
    throw new Error(`login ${loginValue} → ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { cookie: sessionCookie(res), user: res.body.user };
}

/** Входит по magic link; возвращает cookie и AuthUser. */
export async function loginByMagicLink(
  ctx: TestContext,
  email: string,
): Promise<{ cookie: string; user: { id: number; surname: string; name: string; role: string } }> {
  const token = await magicToken(ctx, email);
  const res = await verifyToken(ctx, token);
  if (res.status !== 200) {
    throw new Error(`verify ${email} → ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { cookie: sessionCookie(res), user: res.body.user };
}

/** PATCH /api/users/:id {isActive} от имени `cookie` (root). Бросает, если ответ не 200. */
export async function setActive(ctx: TestContext, rootCookie: string, userId: number, isActive: boolean): Promise<void> {
  const res = await ctx.http().patch(`/api/users/${userId}`).set('Cookie', rootCookie).send({ isActive });
  if (res.status !== 200) {
    throw new Error(`PATCH /api/users/${userId} isActive=${isActive} → ${res.status} ${JSON.stringify(res.body)}`);
  }
}

/** Деактивирует сидового врача doctor1 от имени root. Возвращает его id. */
export async function deactivateDoctor1(ctx: TestContext): Promise<number> {
  const root = await loginAs(ctx, ROOT.login, ROOT.password);
  const doctor = await loginAs(ctx, DOCTOR1.login, DOCTOR1.password);
  await setActive(ctx, root.cookie, doctor.user.id, false);
  return doctor.user.id;
}
