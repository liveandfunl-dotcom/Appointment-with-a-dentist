import { expect, request } from '@playwright/test';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKEND_URL } from './env';

// Вход в e2e.
//
// Rate limit входа (api.md, раздел 3): 20 запросов `POST /api/auth/login` за 15 минут с одного IP.
// Поэтому вне тестов страницы входа сессии не создаются заново на каждый тест: cookie сессии
// кешируется в файле на пользователя и перед использованием проверяется через `GET /api/auth/me`
// (backend пересоздаёт БД при каждом прогоне — старая cookie тогда отвечает 401, и вход повторяется).

type Cookie = Awaited<ReturnType<BrowserContext['cookies']>>[number];

export interface Credentials {
  login: string;
  password: string;
}

const AUTH_DIR = join(tmpdir(), 'clinic-e2e', 'auth');

function cachePath(login: string): string {
  return join(AUTH_DIR, `${login.replace(/[^\w.-]/g, '_')}.json`);
}

function cookieHeader(cookies: Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/** `POST /api/auth/login` напрямую в backend. Возвращает cookie новой сессии. */
export async function apiLogin({ login, password }: Credentials): Promise<Cookie[]> {
  const ctx = await request.newContext({ baseURL: BACKEND_URL });
  try {
    const res = await ctx.post('/api/auth/login', { data: { login, password } });
    if (res.status() !== 200) {
      throw new Error(`Вход ${login} через API: ${res.status()} ${await res.text()}`);
    }
    const { cookies } = await ctx.storageState();
    if (!cookies.some((c) => c.name === 'session')) throw new Error(`Вход ${login}: нет cookie session`);
    return cookies;
  } finally {
    await ctx.dispose();
  }
}

async function isSessionAlive(cookies: Cookie[]): Promise<boolean> {
  const ctx = await request.newContext({
    baseURL: BACKEND_URL,
    extraHTTPHeaders: { cookie: cookieHeader(cookies) },
  });
  try {
    return (await ctx.get('/api/auth/me')).status() === 200;
  } finally {
    await ctx.dispose();
  }
}

/**
 * Cookie сессии пользователя. По умолчанию берётся из файлового кеша (если сессия жива),
 * `fresh: true` — всегда новая сессия (нужно, например, для теста выхода).
 */
export async function sessionCookies(user: Credentials, opts: { fresh?: boolean } = {}): Promise<Cookie[]> {
  const file = cachePath(user.login);
  if (!opts.fresh && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf8')) as Cookie[];
    if (await isSessionAlive(cached)) return cached;
  }
  const cookies = await apiLogin(user);
  if (!opts.fresh) {
    mkdirSync(AUTH_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(cookies));
  }
  return cookies;
}

/**
 * Входит в браузерный контекст страницы под пользователем (cookie через API, без UI).
 * Используется в тестах, которые проверяют не страницу входа.
 */
export async function loginAs(page: Page, user: Credentials, opts: { fresh?: boolean } = {}): Promise<void> {
  await page.context().addCookies(await sessionCookies(user, opts));
}

/** API-клиент backend'а от имени пользователя — для подготовки данных теста. */
export async function apiAs(user: Credentials): Promise<APIRequestContext> {
  const cookies = await sessionCookies(user);
  return request.newContext({ baseURL: BACKEND_URL, storageState: { cookies, origins: [] } });
}

/** API-клиент backend'а без сессии. */
export async function apiGuest(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BACKEND_URL });
}

/**
 * Вход через UI по логину и паролю (docs/specs/ui/screens.md, 5.1): /login → «Войти по логину и паролю»
 * → поля «Логин» и «Пароль» → «Авторизоваться» → переход на /records.
 */
export async function loginViaUi(page: Page, { login, password }: Credentials): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Войти по логину и паролю' }).click();
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Авторизоваться' }).click();
  await expect(page).toHaveURL(/\/records$/);
  await expect(page.getByRole('banner').getByRole('button', { name: 'Выйти' })).toBeVisible();
}
