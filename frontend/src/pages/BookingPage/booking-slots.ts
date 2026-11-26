import type { FreeWindow } from '../../api/types';
import { STEP, toMinutes, toTime } from '../../utils/time';

/** Минимальная длительность записи, минут. */
export const MIN_DURATION = 60;

/** Допустимые времена начала: шаг 30 минут, до конца окна остаётся не меньше MIN_DURATION. */
export function startMarks(windows: FreeWindow[]): string[] {
  return windows.flatMap((w) => {
    const marks: string[] = [];
    for (let m = toMinutes(w.start); m + MIN_DURATION <= toMinutes(w.end); m += STEP) marks.push(toTime(m));
    return marks;
  });
}

/** Допустимые длительности для выбранного начала: от MIN_DURATION с шагом 30 до конца его окна. */
export function durationsFor(start: string, windows: FreeWindow[]): number[] {
  if (!start) return [];
  const from = toMinutes(start);
  const window = windows.find((w) => toMinutes(w.start) <= from && from < toMinutes(w.end));
  if (!window) return [];
  const durations: number[] = [];
  for (let d = MIN_DURATION; from + d <= toMinutes(window.end); d += STEP) durations.push(d);
  return durations;
}
