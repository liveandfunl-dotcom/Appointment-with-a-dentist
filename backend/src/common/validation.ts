import { DEFAULT_LANG, isLang, Lang } from '../i18n/i18n';
import { ApiError } from './api-error';

/** Формат email после trim + lowercase (api.md, 1.4). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX = 254;

/** Тело запроса как объект; не объект (нет тела, массив, примитив) → `{}`. */
export function bodyOf(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** Непустая строка после trim (или без trim) либо null. */
export function nonEmptyString(value: unknown, trim = true): string | null {
  if (typeof value !== 'string') return null;
  const s = trim ? value.trim() : value;
  return s.length > 0 ? s : null;
}

/** Нормализованный (trim + lowercase) валидный email либо null. */
export function parseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= EMAIL_MAX && EMAIL_RE.test(email) ? email : null;
}

/** Язык: отсутствует / null → `ru`; неизвестное значение → null. */
export function parseLang(value: unknown): Lang | null {
  if (value === undefined || value === null) return DEFAULT_LANG;
  return isLang(value) ? value : null;
}

/** Бросает 400 VALIDATION_ERROR, если список невалидных полей не пуст. */
export function assertValid(fields: string[]): void {
  if (fields.length > 0) throw ApiError.validation(fields);
}
