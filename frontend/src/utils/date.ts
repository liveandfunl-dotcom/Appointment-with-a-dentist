/** Дата `YYYY-MM-DD`: форматирование и календарные расчёты в поясе браузера. */

export const pad = (n: number): string => String(n).padStart(2, '0');

export const toIso = (year: number, month: number, day: number): string => `${year}-${pad(month)}-${pad(day)}`;

/**
 * Сегодняшняя дата в поясе `timeZone` (IANA); без пояса — в поясе браузера.
 * `now` задаётся в тестах.
 */
export function todayIso(timeZone?: string, now: Date = new Date()): string {
  if (!timeZone) return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
  // Формат en-CA даёт ровно YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** `YYYY-MM-DD` → `DD.MM.YYYY`. */
export const formatDate = (iso: string): string => iso.split('-').reverse().join('.');

/** День недели даты: 1 (пн) … 7 (вс). */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() || 7;
}
