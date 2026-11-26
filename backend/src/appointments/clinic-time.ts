import { DateTime } from 'luxon';

/** Дата `YYYY-MM-DD` (api.md, 1.4). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MINUTES = 1440;

/** Календарная дата клиники. */
export interface ClinicDate {
  /** `YYYY-MM-DD`. */
  iso: string;
  year: number;
  month: number;
  day: number;
}

/** `YYYY-MM-DD` и существующая календарная дата, иначе null. */
export function parseDate(value: unknown): ClinicDate | null {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!DateTime.fromObject({ year, month, day }, { zone: 'utc' }).isValid) return null;
  return { iso: value, year, month, day };
}

/**
 * Момент «дата + минуты от полуночи» в поясе `tz` → unix sec (data-model.md, 1).
 * Считается по настенному времени; 1440 (`"24:00"`) — 00:00 следующего дня.
 */
export function toSec(date: ClinicDate, minutes: number, tz: string): number {
  const { year, month, day } = date;
  if (minutes >= DAY_MINUTES) {
    return DateTime.fromObject({ year, month, day }, { zone: tz }).plus({ days: 1 }).toSeconds();
  }
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return DateTime.fromObject({ year, month, day, hour, minute }, { zone: tz }).toSeconds();
}

/** unix sec → дата `YYYY-MM-DD` и минуты от полуночи в поясе `tz`. */
export function fromSec(sec: number, tz: string): { date: string; minutes: number } {
  const dt = DateTime.fromSeconds(sec, { zone: tz });
  return { date: dt.toISODate() as string, minutes: dt.hour * 60 + dt.minute };
}

/** Минуты конца записи, начавшейся в `startDate`: 00:00 следующего дня → 1440. */
export function endMinutes(endSec: number, startDate: string, tz: string): number {
  const end = fromSec(endSec, tz);
  return end.date !== startDate && end.minutes === 0 ? DAY_MINUTES : end.minutes;
}

/** День недели даты, 1 = Пн … 7 = Вс. */
export function weekdayOf(date: ClinicDate, tz: string): number {
  const { year, month, day } = date;
  return DateTime.fromObject({ year, month, day }, { zone: tz }).weekday;
}

/** Сегодняшняя дата клиники и ближайшая отметка, кратная 30 минутам, строго после `now` (api.md, 4.11). */
export function todayAndNextMark(now: Date, tz: string): { today: string; nextMark: number } {
  const dt = DateTime.fromJSDate(now, { zone: tz });
  const minutes = dt.hour * 60 + dt.minute + (dt.second * 1000 + dt.millisecond) / 60000;
  return { today: dt.toISODate() as string, nextMark: (Math.floor(minutes / 30) + 1) * 30 };
}

/** `YYYY-MM-DD` → `DD.MM.YYYY` (дата в письме, api.md, 5). */
export function mailDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
