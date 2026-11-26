// Вспомогательные функции для tests/api/users.spec.ts (AC-USERS-01…11).
// Контракт: docs/specs/system/api.md (разделы 1, 2.2, 2.3, 4.4, 4.7–4.10, 4.13, 6),
// сиды: docs/specs/design/data-model.md (раздел 4).
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { Response } from 'supertest';
import { createApp } from '../../../backend/src/app.factory';

/** Фиксированное «сейчас»: чт 2026-11-26 10:00 Europe/Athens (UTC+2). */
export const NOW = new Date('2026-11-26T08:00:00.000Z');

/** Будущий понедельник: рабочий день doctor1 (Пн–Пт, 09:00–17:00). */
export const FUTURE_MONDAY = '2026-11-30';

export interface Credentials {
  login: string;
  password: string;
}

export const ROOT: Credentials = { login: 'root', password: 'root1234' };
export const ADMIN: Credentials = { login: 'admin', password: 'admin1234' };
export const DOCTOR1: Credentials = { login: 'doctor1', password: 'doctor1234' };

export const ROOT_EMAIL = 'root@clinic.local';
export const ADMIN_EMAIL = 'admin@clinic.local';
export const DOCTOR_EMAILS = [1, 2, 3, 4, 5].map((n) => `doctor${n}@clinic.local`);

/** Поля карточки, которые обязаны быть в каждом UserCard (api.md, 2.2). */
export const CARD_FIELDS = [
  'id',
  'surname',
  'name',
  'role',
  'specialization',
  'phone',
  'email',
  'room',
  'workDays',
  'workStart',
  'workEnd',
  'isActive',
] as const;

/** Секреты, которых не должно быть ни в одном ответе. */
export const SECRET_FIELDS = ['pass', 'password'] as const;

export interface UsersTestContext {
  app: INestApplication;
  dir: string;
}

type Method = 'get' | 'post' | 'patch';

/** Поднимает приложение на временной БД с dev-сидом и фиксированными часами. */
export async function startUsersApp(): Promise<UsersTestContext> {
  const dir = mkdtempSync(join(tmpdir(), 'clinic-users-'));
  const app = await createApp({
    dbPath: join(dir, 'test.db'),
    mail: 'memory',
    seedDev: true,
    now: () => NOW,
  });
  return { app, dir };
}

export async function stopUsersApp(ctx: UsersTestContext | undefined): Promise<void> {
  if (!ctx) return;
  await ctx.app.close();
  rmSync(ctx.dir, { recursive: true, force: true });
}

/** HTTP-запрос к приложению; cookie — строка `session=…` или undefined (гость). */
export function call(
  ctx: UsersTestContext,
  method: Method,
  path: string,
  cookie?: string,
  body?: unknown,
): Promise<Response> {
  let req = request(ctx.app.getHttpServer())[method](path);
  if (cookie) req = req.set('Cookie', cookie);
  if (body !== undefined) req = req.send(body as object);
  return req;
}

/** Сырой POST /api/auth/login — для проверок отказа во входе. */
export function tryLogin(ctx: UsersTestContext, creds: Credentials): Promise<Response> {
  return call(ctx, 'post', '/api/auth/login', undefined, creds);
}

function describeResponse(res: Response): string {
  return `${res.status} ${JSON.stringify(res.body)}`;
}

/** Достаёт `session=<token>` из Set-Cookie ответа. */
export function sessionCookie(res: Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown;
  const list: string[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = list.find((c) => c.startsWith('session=') && !c.startsWith('session=;'));
  return found?.split(';')[0];
}

/**
 * Вход по логину и паролю. Возвращает cookie сессии.
 * При неудаче бросает понятную ошибку: «login root failed: 404 {...}».
 */
export async function loginAs(ctx: UsersTestContext, creds: Credentials): Promise<string> {
  const res = await tryLogin(ctx, creds);
  if (res.status !== 200) {
    throw new Error(`login ${creds.login} failed: ${describeResponse(res)}`);
  }
  const cookie = sessionCookie(res);
  if (!cookie) {
    throw new Error(`login ${creds.login} failed: 200 without session cookie`);
  }
  return cookie;
}

/** Список карточек; бросает ошибку, если ответ не 200. */
export async function listUsers(ctx: UsersTestContext, cookie?: string): Promise<UserCard[]> {
  const res = await call(ctx, 'get', '/api/users', cookie);
  if (res.status !== 200 || !Array.isArray(res.body)) {
    throw new Error(`GET /api/users failed: ${describeResponse(res)}`);
  }
  return res.body as UserCard[];
}

/** id пользователя по email через список root (root видит врачей и админов). */
export async function userIdByEmail(
  ctx: UsersTestContext,
  rootCookie: string,
  email: string,
): Promise<number> {
  const users = await listUsers(ctx, rootCookie);
  const user = users.find((u) => u.email === email);
  if (!user) throw new Error(`user ${email} not found in GET /api/users (root)`);
  return user.id;
}

/** id текущего пользователя через GET /api/auth/me (root в списке не показывается). */
export async function meId(ctx: UsersTestContext, cookie: string): Promise<number> {
  const res = await call(ctx, 'get', '/api/auth/me', cookie);
  if (res.status !== 200 || typeof res.body?.id !== 'number') {
    throw new Error(`GET /api/auth/me failed: ${describeResponse(res)}`);
  }
  return res.body.id as number;
}

export interface UserCard {
  id: number;
  surname: string;
  name: string;
  role: 'root' | 'admin' | 'doctor';
  specialization: string | null;
  phone: string | null;
  email: string;
  room: number | null;
  workDays: number[];
  workStart: string | null;
  workEnd: string | null;
  isActive: boolean;
  [key: string]: unknown;
}

/** Корректное тело POST /api/users для врача (api.md, 4.9). */
export function doctorPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    role: 'doctor',
    surname: 'Сидоров',
    name: 'Сергей',
    phone: '+30 210 000 0042',
    email: 'new.doctor@clinic.local',
    specialization: 'Терапевт',
    room: 201,
    workDays: [1, 2, 3, 4, 5],
    workStart: '09:00',
    workEnd: '17:00',
    login: 'sidorov',
    password: 'secret123',
    ...overrides,
  };
}

/** Корректное тело POST /api/users для администратора (только root). */
export function adminPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    role: 'admin',
    surname: 'Петров',
    name: 'Пётр',
    phone: '+30 210 000 0200',
    email: 'admin2@clinic.local',
    ...overrides,
  };
}

/** Корректное тело POST /api/appointments: будущий понедельник 10:00–11:00. */
export function appointmentPayload(doctorId: number): Record<string, unknown> {
  return {
    doctorId,
    date: FUTURE_MONDAY,
    start: '10:00',
    end: '11:00',
    patientName: 'Мария Кузнецова',
    patientPhone: '+30 690 000 0000',
    lang: 'ru',
  };
}

/** Проверяет, что в объекте нет pass/password. */
export function expectNoSecrets(obj: Record<string, unknown>): void {
  for (const key of SECRET_FIELDS) {
    expect(obj).not.toHaveProperty(key);
  }
}

/** Проверяет публичную карточку: все поля UserCard есть, login/pass/password нет. */
export function expectPublicCard(card: Record<string, unknown>): void {
  for (const key of CARD_FIELDS) {
    expect(card).toHaveProperty(key);
  }
  expect(card).not.toHaveProperty('login');
  expectNoSecrets(card);
}

/** Ожидаемый ответ-ошибка `{ code, fields? }` с вхождением полей. */
export function expectError(res: Response, status: number, code: string, fields?: string[]): void {
  expect({ status: res.status, code: res.body?.code }).toEqual({ status, code });
  if (fields) {
    expect(res.body.fields).toEqual(expect.arrayContaining(fields));
  }
}
