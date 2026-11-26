/** computeFreeWindows — чистый алгоритм свободных окон (docs/plans/code-quality.md, AC-REFAC-04; api.md, 4.11). */
import { computeFreeWindows } from '../../backend/src/appointments/free-windows';

const busy = (start: number, end: number) => ({ start, end });

describe('computeFreeWindows', () => {
  test('AC-REFAC-04: рабочий интервал без записей → одно окно', () => {
    expect(computeFreeWindows({ workStart: 540, workEnd: 1020, earliest: null, busy: [] })).toEqual([
      { start: '09:00', end: '17:00' },
    ]);
  });

  test('AC-REFAC-04: запись разрезает интервал на два окна', () => {
    const windows = computeFreeWindows({ workStart: 540, workEnd: 1020, earliest: null, busy: [busy(660, 720)] });
    expect(windows).toEqual([
      { start: '09:00', end: '11:00' },
      { start: '12:00', end: '17:00' },
    ]);
  });

  test('AC-REFAC-04: окна короче 60 минут отбрасываются', () => {
    const windows = computeFreeWindows({ workStart: 540, workEnd: 1020, earliest: null, busy: [busy(570, 990)] });
    expect(windows).toEqual([]);
  });

  test('AC-REFAC-04: запись в самом начале и в самом конце', () => {
    const windows = computeFreeWindows({
      workStart: 540,
      workEnd: 1020,
      earliest: null,
      busy: [busy(540, 600), busy(960, 1020)],
    });
    expect(windows).toEqual([{ start: '10:00', end: '16:00' }]);
  });

  test('AC-REFAC-04: смежные записи не создают окно между собой', () => {
    const windows = computeFreeWindows({
      workStart: 540,
      workEnd: 1020,
      earliest: null,
      busy: [busy(600, 660), busy(660, 720)],
    });
    expect(windows).toEqual([
      { start: '09:00', end: '10:00' },
      { start: '12:00', end: '17:00' },
    ]);
  });

  test('AC-REFAC-04: earliest сдвигает начало окна (сегодняшний день)', () => {
    const windows = computeFreeWindows({ workStart: 540, workEnd: 1020, earliest: 630, busy: [] });
    expect(windows).toEqual([{ start: '10:30', end: '17:00' }]);
  });

  test('AC-REFAC-04: earliest раньше начала работы ничего не меняет', () => {
    const windows = computeFreeWindows({ workStart: 540, workEnd: 1020, earliest: 300, busy: [] });
    expect(windows).toEqual([{ start: '09:00', end: '17:00' }]);
  });

  test('AC-REFAC-04: earliest после конца работы → окон нет', () => {
    expect(computeFreeWindows({ workStart: 540, workEnd: 1020, earliest: 1050, busy: [] })).toEqual([]);
  });

  test('AC-REFAC-04: запись до 24:00 (1440) и окно до 24:00', () => {
    const windows = computeFreeWindows({ workStart: 720, workEnd: 1440, earliest: null, busy: [busy(1320, 1440)] });
    expect(windows).toEqual([{ start: '12:00', end: '22:00' }]);
  });

  test('AC-REFAC-04: рабочий день до 24:00 без записей', () => {
    expect(computeFreeWindows({ workStart: 1200, workEnd: 1440, earliest: null, busy: [] })).toEqual([
      { start: '20:00', end: '24:00' },
    ]);
  });
});
