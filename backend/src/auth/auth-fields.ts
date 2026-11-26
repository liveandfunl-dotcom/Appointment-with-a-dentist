import type { Lang } from '@clinic/shared';
import { assertValid, nonEmptyString, parseEmail, parseLang } from '../common/validation';

/** Разобранное тело `POST /api/auth/magic-link` (api.md, 4.2). */
export interface MagicLinkRequest {
  email: string;
  lang: Lang;
}

/** Разобранное тело `POST /api/auth/login` (api.md, 4.4). */
export interface LoginRequest {
  login: string;
  password: string;
}

/** Невалидные поля → 400 VALIDATION_ERROR со списком в порядке проверки. */
export function parseMagicLinkRequest(body: Record<string, unknown>): MagicLinkRequest {
  const email = parseEmail(body.email);
  const lang = parseLang(body.lang);
  const invalid: string[] = [];
  if (!email) invalid.push('email');
  if (!lang) invalid.push('lang');
  assertValid(invalid);
  return { email: email as string, lang: lang as Lang };
}

/** Тело `POST /api/auth/magic-link/verify` (api.md, 4.3): `token` — строка. */
export function parseVerifyRequest(body: Record<string, unknown>): { token: string } {
  const { token } = body;
  if (typeof token !== 'string') assertValid(['token']);
  return { token: token as string };
}

/** Логин обрезается, пароль — нет (api.md, 4.4). */
export function parseLoginRequest(body: Record<string, unknown>): LoginRequest {
  const login = nonEmptyString(body.login);
  const password = nonEmptyString(body.password, false);
  const invalid: string[] = [];
  if (!login) invalid.push('login');
  if (!password) invalid.push('password');
  assertValid(invalid);
  return { login: login as string, password: password as string };
}
