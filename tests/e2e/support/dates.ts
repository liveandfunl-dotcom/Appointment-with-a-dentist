import { CLINIC_TZ } from './env';

// Даты в формате 'YYYY-MM-DD' в часовом поясе клиники. День недели — ISO: 1 = Пн … 7 = Вс.

/** Сегодня в часовом поясе клиники. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** ISO-день недели: 1 = Пн … 7 = Вс. */
export function isoWeekday(iso: string): number {
  const wd = toUtc(iso).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/**
 * Ближайшая дата не раньше чем через `minOffset` дней от сегодня (по умолчанию — завтра),
 * в которую врач с графиком `workDays` принимает. Завтра, а не сегодня — чтобы окна
 * не зависели от текущего времени.
 *
 * Разные тесты передают разные `minOffset`, чтобы не делить одну дату врача между собой.
 */
export function nextWorkingDate(workDays: readonly number[], minOffset = 1): string {
  for (let i = minOffset; i < minOffset + 14; i++) {
    const date = addDays(today(), i);
    if (workDays.includes(isoWeekday(date))) return date;
  }
  throw new Error(`Нет рабочего дня в графике ${workDays.join(',')}`);
}

/** Ближайшая дата не раньше чем через `minOffset` дней, в которую врач НЕ принимает. */
export function nextDayOff(workDays: readonly number[], minOffset = 1): string {
  for (let i = minOffset; i < minOffset + 14; i++) {
    const date = addDays(today(), i);
    if (!workDays.includes(isoWeekday(date))) return date;
  }
  throw new Error(`В графике ${workDays.join(',')} нет выходных`);
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY' (формат интерфейса и писем). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
