import type { TimeWindow } from '@clinic/shared';
import { formatTime } from '../common/time';

/** Минимальная длительность записи и свободного окна, минут (api.md, 4.11). */
export const MIN_DURATION = 60;

/** Занятый отрезок дня: минуты от полуночи, конец 1440 = «24:00». */
export interface BusyInterval {
  start: number;
  end: number;
}

export interface FreeWindowsInput {
  /** Начало и конец приёма врача, минуты от полуночи. */
  workStart: number;
  workEnd: number;
  /** Самое раннее допустимое начало (сегодня — ближайшая отметка после «сейчас»); null — без ограничения. */
  earliest: number | null;
  /** Активные записи дня, отсортированные по началу. */
  busy: BusyInterval[];
}

/** Алгоритм свободных окон (api.md, 4.11): рабочий интервал минус записи, окна короче MIN_DURATION отбрасываются. */
export function computeFreeWindows({ workStart, workEnd, earliest, busy }: FreeWindowsInput): TimeWindow[] {
  const windows: Array<[number, number]> = [];
  let cursor = Math.max(workStart, earliest ?? 0);
  for (const b of busy) {
    if (b.start > cursor) windows.push([cursor, Math.min(b.start, workEnd)]);
    cursor = Math.max(cursor, b.end);
  }
  windows.push([cursor, workEnd]);
  return windows
    .filter(([start, end]) => end - start >= MIN_DURATION)
    .map(([start, end]) => ({ start: formatTime(start), end: formatTime(end) }));
}
