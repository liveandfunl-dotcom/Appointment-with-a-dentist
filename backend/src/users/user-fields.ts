import { parseEmail } from '../common/validation';
import { parseTime } from '../common/time';

/** Значение поля в формате колонки Users. Парсер возвращает null, если значение невалидно. */
export type ColumnValue = string | number;
type Parser = (value: unknown) => ColumnValue | null;

const LOGIN_RE = /^[A-Za-z0-9._-]+$/;
const PASSWORD_MIN = 8;

function text(max: number): Parser {
  return (value) => {
    if (typeof value !== 'string') return null;
    const s = value.trim();
    return s.length >= 1 && s.length <= max ? s : null;
  };
}

function room(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;
}

/** Массив уникальных целых 1…7, минимум один → `"1,3,5"` по возрастанию. */
function workDays(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ok = value.every((d) => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 7);
  if (!ok || new Set(value).size !== value.length) return null;
  return [...(value as number[])].sort((a, b) => a - b).join(',');
}

/** Поля, общие для врача и администратора (api.md, 4.9). */
export const COMMON_FIELDS: Record<string, Parser> = {
  surname: text(100),
  name: text(100),
  phone: text(32),
  email: parseEmail,
};

/** Поля врача; у администратора игнорируются. */
export const DOCTOR_FIELDS: Record<string, Parser> = {
  specialization: text(100),
  room,
  workDays,
  workStart: parseTime,
  workEnd: parseTime,
};

/**
 * Разбирает поля `specs` из тела в `out`, невалидные имена добавляет в `invalid`.
 * `partial` (PATCH) — отсутствующие поля пропускаются; иначе (POST) они обязательны.
 */
export function collectFields(
  body: Record<string, unknown>,
  specs: Record<string, Parser>,
  partial: boolean,
  out: Record<string, ColumnValue | null>,
  invalid: string[],
): void {
  for (const [key, parse] of Object.entries(specs)) {
    if (partial && body[key] === undefined) continue;
    const value = parse(body[key]);
    if (value === null) invalid.push(key);
    else out[key] = value;
  }
}

/** `workStart < workEnd` по итоговым значениям, иначе ошибка в `workEnd` (AC-USERS-04). */
export function checkWorkHours(start: unknown, end: unknown, invalid: string[]): void {
  if (invalid.includes('workStart') || invalid.includes('workEnd')) return;
  if (typeof start === 'number' && typeof end === 'number' && start >= end) invalid.push('workEnd');
}

/** login: `''`, пробелы или null → `''` (логина нет); невалидный → null. */
export function parseLogin(value: unknown): string | null {
  if (value === null) return '';
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s === '') return '';
  return s.length >= 3 && s.length <= 50 && LOGIN_RE.test(s) ? s : null;
}

/** password: отсутствует, null или `''` → `''` (не задан); невалидный → null. Не обрезается. */
export function parsePassword(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return '';
  return typeof value === 'string' && value.length >= PASSWORD_MIN ? value : null;
}
