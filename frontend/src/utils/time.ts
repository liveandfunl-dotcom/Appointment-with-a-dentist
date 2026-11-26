import { pad } from './date';

/** `"HH:mm"` → минуты от полуночи. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Минуты от полуночи → `"HH:mm"` (1440 → `"24:00"`). */
export const toTime = (minutes: number): string => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** Длительность в минутах → `"H:mm"`. */
export const formatDuration = (minutes: number): string => `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;

/** Шаг времени записи и приёма, минут. */
export const STEP = 30;

/** 00:00, 00:30 … 24:00. */
export const TIME_MARKS: string[] = Array.from({ length: 24 * 60 / STEP + 1 }, (_, i) => toTime(i * STEP));
