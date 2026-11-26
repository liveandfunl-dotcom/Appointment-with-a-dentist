import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { Response } from 'supertest';
import { createApp } from '../../../backend/src/app.factory';
import type { MailMode } from '../../../backend/src/app.options';
import { MailService } from '../../../backend/src/mail/mail.service';
import type { MailMessage } from '../../../backend/src/mail/mail.service';

// Вспомогательные функции для slots.spec.ts и appointments.spec.ts (AC-SLOTS-*, AC-APPT-*, AC-MAIL-*).
// Контракт: docs/specs/system/api.md, сиды: docs/specs/design/data-model.md, раздел 4.

export const TZ = 'Europe/Athens';

/**
 * Момент в часовом поясе клиники. Все даты тестов — декабрь 2026, Афины в это время
 * живут по зимнему времени EET (UTC+2), летнее время начинается только 2027-03-28.
 */
export function athens(date: string, time: string, seconds = 0): Date {
  const ss = String(seconds).padStart(2, '0');
  return new Date(`${date}T${time}:${ss}+02:00`);
}

/** Базовый момент тестов: понедельник 2026-12-07 10:10 по Афинам (= 08:10 UTC, unix 1796631000). */
export const BASE_NOW = athens('2026-12-07', '10:10');

/** Календарь вокруг BASE_NOW. */
export const D = {
  /** Пт, прошлая неделя. */
  pastFri: '2026-12-04',
  /** Вс, вчера. */
  yesterday: '2026-12-06',
  /** Пн, сегодня. */
  today: '2026-12-07',
  tue: '2026-12-08',
  wed: '2026-12-09',
  thu: '2026-12-10',
  fri: '2026-12-11',
  sat: '2026-12-12',
  sun: '2026-12-13',
} as const;

export type SeedLogin = 'root' | 'admin' | 'doctor1' | 'doctor2' | 'doctor3' | 'doctor4' | 'doctor5';

const PASSWORDS: Record<SeedLogin, string> = {
  root: 'root1234',
  admin: 'admin1234',
  doctor1: 'doctor1234',
  doctor2: 'doctor1234',
  doctor3: 'doctor1234',
  doctor4: 'doctor1234',
  doctor5: 'doctor1234',
};

export interface AuthUser {
  id: number;
  surname: string;
  name: string;
  role: 'root' | 'admin' | 'doctor';
}

export interface Session {
  /** Значение для заголовка Cookie: `session=<token>`. */
  cookie: string;
  user: AuthUser;
}

export interface Window {
  start: string;
  end: string;
}

export interface BookingBody {
  doctorId?: unknown;
  date?: unknown;
  start?: unknown;
  end?: unknown;
  patientName?: unknown;
  patientPhone?: unknown;
  comment?: unknown;
  lang?: unknown;
  [extra: string]: unknown;
}

export const PATIENT = {
  patientName: 'Мария Кузнецова',
  patientPhone: '+30 690 000 0000',
} as const;

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  /** Перевести часы приложения. */
  setNow(d: Date): void;
  now(): Date;
  /** Текущее время приложения в unix sec. */
  nowSec(): number;
  outbox(): MailMessage[];
  /** Вход по логину (кешируется). Бросает `login <login> failed: <status>`. */
  login(login: SeedLogin): Promise<Session>;
  /** id сидового врача по email `doctorN@clinic.local` (через GET /api/users). */
  doctorId(n: 1 | 2 | 3 | 4 | 5): Promise<number>;
  close(): Promise<void>;
}

export async function startApp(opts: { mail?: MailMode; now?: Date } = {}): Promise<TestApp> {
  const dir = mkdtempSync(join(tmpdir(), 'clinic-appt-'));
  let clock = opts.now ?? BASE_NOW;
  let app: INestApplication;
  try {
    app = await createApp({
      dbPath: join(dir, 'test.db'),
      mail: opts.mail ?? 'memory',
      seedDev: true,
      timezone: TZ,
      now: () => clock,
    });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  const http = request(app.getHttpServer());
  const sessions = new Map<SeedLogin, Session>();
  const doctorIds = new Map<number, number>();

  const ctx: TestApp = {
    app,
    http,
    setNow(d) {
      clock = d;
    },
    now: () => clock,
    nowSec: () => Math.floor(clock.getTime() / 1000),
    outbox: () => app.get(MailService).outbox,
    async login(login) {
      const cached = sessions.get(login);
      if (cached) return cached;
      const res = await http.post('/api/auth/login').send({ login, password: PASSWORDS[login] });
      if (res.status !== 200) throw new Error(`login ${login} failed: ${res.status}`);
      const cookie = sessionCookie(res);
      if (!cookie) throw new Error(`login ${login} failed: no session cookie`);
      const session: Session = { cookie, user: res.body.user as AuthUser };
      sessions.set(login, session);
      return session;
    },
    async doctorId(n) {
      const cached = doctorIds.get(n);
      if (cached) return cached;
      const res = await http.get('/api/users');
      if (res.status !== 200) throw new Error(`GET /api/users failed: ${res.status}`);
      const email = `doctor${n}@clinic.local`;
      const card = (res.body as Array<{ id: number; email: string }>).find((u) => u.email === email);
      if (!card) throw new Error(`doctor ${email} not found in GET /api/users`);
      doctorIds.set(n, card.id);
      return card.id;
    },
    async close() {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
  return ctx;
}

/** `session=<token>` из Set-Cookie. */
export function sessionCookie(res: Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  const line = list.find((c) => c.startsWith('session='));
  return line?.split(';')[0];
}

export function freeWindows(t: TestApp, cookie: string | null, doctorId: number, date?: string) {
  const req = t.http.get(`/api/doctors/${doctorId}/free-windows`);
  if (date !== undefined) req.query({ date });
  if (cookie) req.set('Cookie', cookie);
  return req;
}

/** free-windows с проверкой 200. */
export async function windowsOk(t: TestApp, cookie: string, doctorId: number, date: string): Promise<Window[]> {
  const res = await freeWindows(t, cookie, doctorId, date);
  if (res.status !== 200) {
    throw new Error(`free-windows ${doctorId} ${date} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as Window[];
}

export function book(t: TestApp, cookie: string | null, body: BookingBody) {
  const req = t.http.post('/api/appointments').send(body);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

/** Создать запись с проверкой 201. Поля пациента по умолчанию — PATIENT. */
export async function bookOk(
  t: TestApp,
  cookie: string,
  slot: { doctorId: number; date: string; start: string; end: string } & BookingBody,
): Promise<Record<string, unknown> & { id: number }> {
  const res = await book(t, cookie, { ...PATIENT, ...slot });
  if (res.status !== 201) {
    throw new Error(
      `POST /api/appointments ${slot.date} ${slot.start}-${slot.end} failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return res.body as Record<string, unknown> & { id: number };
}

export function listAppointments(t: TestApp, cookie: string | null, query: Record<string, string | number>) {
  const req = t.http.get('/api/appointments').query(query);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

export function cancel(t: TestApp, cookie: string | null, id: number | string) {
  const req = t.http.post(`/api/appointments/${id}/cancel`);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

/** Деактивировать пользователя от имени admin (PATCH /api/users/:id {isActive:false}). */
export async function deactivate(t: TestApp, userId: number): Promise<void> {
  const admin = await t.login('admin');
  const res = await t.http.patch(`/api/users/${userId}`).set('Cookie', admin.cookie).send({ isActive: false });
  if (res.status !== 200) throw new Error(`deactivate ${userId} failed: ${res.status}`);
}
